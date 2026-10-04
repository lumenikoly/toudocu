import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { ToudocuError } from '@toudocu/contracts';
import { publishNoReplace, tryLockReviewFile, unlockReviewFile } from './native-helper.js';
import {
  claimAgentDelivery,
  createReviewDiscussion,
  loadReviewState,
  respondAgentDelivery,
  updateReviewDiscussion,
} from './review-service.js';

const exec = promisify(execFile);

function stateDigest(value: Record<string, unknown>): string {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  copy.stateDigest = '';
  delete copy.repositoryRevision;
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

async function fixture(): Promise<{ root: string; stateHome: string; statePath: string }> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-agent-review-'));
  const stateHome = await mkdtemp(join(tmpdir(), 'toudocu-agent-state-'));
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n');
  await exec('git', ['init', '-q'], { cwd: root });
  const stateDirectory = join(
    stateHome,
    'toudocu',
    'agent-feedback',
    createHash('sha256').update(root).digest('hex'),
  );
  await mkdir(stateDirectory, { recursive: true });
  const statePath = join(stateDirectory, 'state.json');
  const state: Record<string, unknown> = {
    schemaVersion: 1,
    storeVersion: 1,
    revision: 0,
    stateDigest: '',
    docsPath: 'docs',
    nextSequence: 1,
    session: {
      id: 'SESS-01',
      createdAt: '2026-09-19T10:00:00Z',
      discussions: [
        {
          id: 'DISC-01',
          state: 'open',
          target: { kind: 'document', path: 'docs/guide.md' },
          placement: { status: 'current', path: 'docs/guide.md' },
          messages: [
            {
              id: 'MSG-01',
              author: 'human',
              intent: 'change_request',
              state: 'submitted',
              text: 'Please review this guide.',
              deliveryId: 'DEL-01',
              evidence: [],
              changedPaths: [],
              createdAt: '2026-09-19T10:00:00Z',
              submittedAt: '2026-09-19T10:00:00Z',
            },
          ],
          createdAt: '2026-09-19T10:00:00Z',
          updatedAt: '2026-09-19T10:00:00Z',
        },
      ],
    },
    deliveries: [
      {
        schemaVersion: 1,
        id: 'DEL-01',
        sequence: 1,
        state: 'pending',
        discussionId: 'DISC-01',
        messageIds: ['MSG-01'],
        createdAt: '2026-09-19T10:00:00Z',
      },
    ],
  };
  state.stateDigest = stateDigest(state);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return { root, stateHome, statePath };
}

async function cleanup(value: { root: string; stateHome: string }): Promise<void> {
  await rm(value.root, { recursive: true, force: true });
  await rm(value.stateHome, { recursive: true, force: true });
}

test('keeps a persistent lock file while releasing the native process lock', async () => {
  const value = await fixture();
  const lockPath = join(dirname(value.statePath), 'state.lock');
  try {
    const first = tryLockReviewFile(lockPath);
    expect(first).toBeDefined();
    expect(tryLockReviewFile(lockPath)).toBeUndefined();
    unlockReviewFile(first!);
    expect(() => unlockReviewFile(first!)).not.toThrow();
    expect(() => tryLockReviewFile(`${lockPath}\0suffix`)).toThrow();
    expect((await lstat(lockPath)).isFile()).toBe(true);
    const second = tryLockReviewFile(lockPath);
    expect(second).toBeDefined();
    unlockReviewFile(second!);

    const source = join(dirname(value.statePath), 'source.tmp');
    const destination = join(dirname(value.statePath), 'published.tmp');
    await writeFile(source, 'first');
    publishNoReplace(source, destination);
    expect(await readFile(destination, 'utf8')).toBe('first');
    await writeFile(source, 'second');
    expect(() => publishNoReplace(source, destination)).toThrow();
  } finally {
    await cleanup(value);
  }
});

test('browser discussion mutations feed the existing CLI delivery queue', async () => {
  const value = await fixture();
  try {
    await rm(value.statePath);
    const options = {
      repositoryRoot: value.root,
      documentationRoot: join(value.root, 'docs'),
      stateHome: value.stateHome,
    };
    const initial = await loadReviewState(options);
    const created = await createReviewDiscussion(
      {
        expectedRevision: initial.revision,
        expectedStateDigest: initial.stateDigest,
        target: { kind: 'document', path: 'docs/guide.md' },
        intent: 'question',
        text: 'Is this guide current?',
      },
      options,
    );
    expect((await loadReviewState(options)).stateDigest).toBe(created.stateDigest);
    const discussion = created.session?.discussions.find((item) =>
      item.messages.some((message) => message.text === 'Is this guide current?'),
    );
    expect(discussion).toBeDefined();
    const resolved = await updateReviewDiscussion(
      discussion!.id,
      {
        expectedRevision: created.revision,
        expectedStateDigest: created.stateDigest,
        state: 'resolved',
      },
      options,
    );
    expect(resolved.session?.discussions.find((item) => item.id === discussion!.id)?.state).toBe(
      'resolved',
    );
    const delivery = await claimAgentDelivery(options);
    expect(delivery.pending).toBe(true);
    expect(delivery.discussion?.id).toBe(discussion!.id);
  } finally {
    await cleanup(value);
  }
});

test.skipIf(process.platform === 'win32')(
  'does not leak a review lock into child processes',
  async () => {
    const value = await fixture();
    const lockPath = join(dirname(value.statePath), 'state.lock');
    const lock = tryLockReviewFile(lockPath);
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000)'], {
      stdio: 'ignore',
    });
    try {
      await new Promise<void>((resolvePromise, reject) => {
        child.once('spawn', resolvePromise);
        child.once('error', reject);
      });
      unlockReviewFile(lock!);
      const next = tryLockReviewFile(lockPath);
      expect(next).toBeDefined();
      unlockReviewFile(next!);
    } finally {
      child.kill('SIGKILL');
      await cleanup(value);
    }
  },
);

test('claims and responds through the versioned local queue', async () => {
  const value = await fixture();
  try {
    const request = await claimAgentDelivery({
      repositoryRoot: value.root,
      stateHome: value.stateHome,
    });
    expect(request.pending).toBe(true);
    expect(request.deliveryId).toBe('DEL-01');
    expect(request.discussion?.id).toBe('DISC-01');

    const response = await respondAgentDelivery(
      {
        schemaVersion: 1,
        deliveryId: 'DEL-01',
        discussionId: 'DISC-01',
        outcome: 'changed',
        message: '<Updated> & verified.',
        changedPaths: ['docs/guide.md'],
      },
      { repositoryRoot: value.root, stateHome: value.stateHome },
    );
    expect(response.accepted).toBe(true);
    expect(response.revision).toBe(2);

    const repeated = await respondAgentDelivery(
      {
        schemaVersion: 1,
        deliveryId: 'DEL-01',
        discussionId: 'DISC-01',
        outcome: 'changed',
        message: '<Updated> & verified.',
        changedPaths: ['docs/guide.md'],
      },
      { repositoryRoot: value.root, stateHome: value.stateHome },
    );
    expect(repeated).toEqual(response);
    await expect(
      claimAgentDelivery({ repositoryRoot: value.root, stateHome: value.stateHome }),
    ).resolves.toEqual({ schemaVersion: 1, pending: false });
  } finally {
    await cleanup(value);
  }
});

test('reanchors a changed discussion before returning the request', async () => {
  const value = await fixture();
  try {
    const state = JSON.parse(await readFile(value.statePath, 'utf8')) as Record<string, unknown> & {
      session: {
        discussions: Array<{
          id: string;
          state: string;
          target: Record<string, unknown>;
          anchor?: unknown;
          placement: unknown;
          messages: unknown[];
          createdAt: string;
          updatedAt: string;
        }>;
      };
    };
    const discussion = state.session.discussions[0];
    const anchor = {
      kind: 'document',
      path: 'docs/guide.md',
      sourceDigest: 'sha256:stale',
      range: {
        start: { line: 1, column: 1 },
        end: { line: 1, column: 7 },
      },
      selectedText: 'Guide',
    };
    state.session.discussions[0] = {
      id: discussion.id,
      state: 'open',
      target: { kind: 'document', path: 'docs/guide.md' },
      anchor,
      placement: { status: 'stale', path: 'docs/guide.md' },
      messages: discussion.messages,
      createdAt: discussion.createdAt,
      updatedAt: discussion.updatedAt,
    };
    state.stateDigest = stateDigest(state);
    await writeFile(value.statePath, `${JSON.stringify(state, null, 2)}\n`);

    const request = await claimAgentDelivery({
      repositoryRoot: value.root,
      stateHome: value.stateHome,
    });
    expect(request.target).toMatchObject({
      anchorState: 'moved',
      path: 'docs/guide.md',
      range: {
        start: { line: 1, column: 3 },
        end: { line: 1, column: 8 },
      },
    });
  } finally {
    await cleanup(value);
  }
});

test('rejects unknown response fields and paths outside the trusted root', async () => {
  const value = await fixture();
  try {
    await expect(
      respondAgentDelivery(
        {
          schemaVersion: 1,
          deliveryId: 'DEL-01',
          discussionId: 'DISC-01',
          outcome: 'answered',
          message: 'No change.',
          unknown: true,
        },
        { repositoryRoot: value.root, stateHome: value.stateHome },
      ),
    ).rejects.toMatchObject({ code: 'AGENT_INVALID_MESSAGE' });

    await expect(
      respondAgentDelivery(
        {
          schemaVersion: 1,
          deliveryId: 'DEL-01',
          discussionId: 'DISC-01',
          outcome: 'changed',
          message: 'Changed outside the repository.',
          changedPaths: ['../outside.md'],
        },
        { repositoryRoot: value.root, stateHome: value.stateHome },
      ),
    ).rejects.toMatchObject({ code: 'AGENT_INVALID_PATH' });
  } finally {
    await cleanup(value);
  }
});
