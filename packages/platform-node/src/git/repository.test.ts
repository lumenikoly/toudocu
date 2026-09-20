import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { openGitRepository } from './repository.js';

const execFileAsync = promisify(execFile);

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    shell: false,
  });
  return result.stdout;
}

async function fixture(documentRelative = 'docs') {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-git-'));
  const docsRoot = join(root, documentRelative);
  await mkdir(docsRoot, { recursive: true });
  await mkdir(join(root, 'docs-other'));
  for (const [path, content] of [
    ['staged café\nname.md', 'staged'],
    ['unstaged 東京 name.md', 'unstaged'],
    ['old name.md', 'rename me'],
    ['keep.md', 'keep'],
  ] as const)
    await writeFile(join(docsRoot, path), content);
  await writeFile(join(root, 'docs-other', 'peer.md'), 'peer');
  await git(root, ['init', '-q']);
  await git(root, ['config', 'user.name', 'Toudocu Test']);
  await git(root, ['config', 'user.email', 'toudocu@example.test']);
  await git(root, ['add', '--', '.']);
  await git(root, ['commit', '-qm', 'initial']);
  const initial = (await git(root, ['rev-parse', 'HEAD'])).trim();
  return { root, docsRoot, initial };
}

test('reads scoped status and working-tree changes without refreshing the index', async () => {
  const { root, docsRoot, initial } = await fixture();
  try {
    const staged = join(docsRoot, 'staged café\nname.md');
    const unstaged = join(docsRoot, 'unstaged 東京 name.md');
    await writeFile(staged, 'staged changed');
    await git(root, ['add', '--', 'docs/staged café\nname.md']);
    await writeFile(unstaged, 'unstaged changed');
    await writeFile(join(docsRoot, 'new space café\nname.md'), 'new');
    await writeFile(join(root, 'docs-other', 'excluded.md'), 'excluded');

    const indexBefore = await readFile(join(root, '.git/index'));
    const repository = await openGitRepository(docsRoot);
    const status = await repository.status();
    const changes = await repository.changes(
      { type: 'commit', resolved: initial },
      { type: 'working-tree' },
    );
    const indexAfter = await readFile(join(root, '.git/index'));

    expect(indexAfter).toEqual(indexBefore);
    expect(status.get('docs/staged café\nname.md')).toMatchObject({
      staged: true,
      unstaged: false,
      untracked: false,
    });
    expect(status.get('docs/unstaged 東京 name.md')).toMatchObject({
      staged: false,
      unstaged: true,
      untracked: false,
    });
    expect(status.get('docs/new space café\nname.md')).toMatchObject({
      staged: false,
      unstaged: true,
      untracked: true,
    });
    expect(status.has('docs-other/excluded.md')).toBe(false);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'docs/staged café\nname.md', status: 'modified' }),
        expect.objectContaining({ path: 'docs/unstaged 東京 name.md', status: 'modified' }),
        expect.objectContaining({ path: 'docs/new space café\nname.md', status: 'untracked' }),
      ]),
    );
    expect(changes.map((change) => change.path)).not.toContain('docs-other/excluded.md');
    expect(changes.find((change) => change.path === 'docs/new space café\nname.md')?.state).toEqual(
      expect.objectContaining({ untracked: true }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports renamed documentation between resolved commits', async () => {
  const { root, docsRoot, initial } = await fixture();
  try {
    await git(root, ['mv', '--', 'docs/old name.md', 'docs/new 東京 name.md']);
    await git(root, ['commit', '-qm', 'rename']);
    const repository = await openGitRepository(docsRoot);
    const renamed = await repository.changes(
      { type: 'commit', resolved: initial },
      { type: 'commit', resolved: await repository.resolveCommit('HEAD') },
    );

    expect(renamed).toEqual([
      expect.objectContaining({
        status: 'renamed',
        oldPath: 'docs/old name.md',
        path: 'docs/new 東京 name.md',
      }),
    ]);
    expect(renamed[0]?.state).toMatchObject({
      staged: false,
      unstaged: false,
      untracked: false,
      committedInBranch: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not execute configured Git clean filters while reading changes', async () => {
  const { root, docsRoot, initial } = await fixture();
  const marker = join(root, 'clean-filter-ran');
  try {
    await writeFile(join(root, '.gitattributes'), 'docs/*.md filter=evil\n');
    await git(root, ['add', '--', '.gitattributes']);
    await git(root, ['commit', '-qm', 'attributes']);
    await git(root, ['config', 'filter.evil.clean', `sh -c 'printf clean > ${marker}; cat'`]);
    await git(root, ['config', 'filter.evil.required', 'true']);
    await writeFile(join(docsRoot, 'keep.md'), 'changed');

    const repository = await openGitRepository(docsRoot);
    await repository.status();
    await repository.changes({ type: 'commit', resolved: initial }, { type: 'working-tree' });

    await expect(readFile(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('read operations do not contact a configured remote', async () => {
  const { root, docsRoot, initial } = await fixture();
  try {
    await git(root, ['remote', 'add', 'origin', 'http://127.0.0.1:1/network-is-forbidden']);
    const repository = await openGitRepository(docsRoot, { timeoutMs: 2_000 });

    await expect(repository.status()).resolves.toBeInstanceOf(Map);
    await expect(repository.resolveCommit('HEAD')).resolves.toBe(initial);
    await expect(
      repository.changes({ type: 'commit', resolved: initial }, { type: 'working-tree' }),
    ).resolves.toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects invalid revisions, treats path arguments literally, and honors pre-abort', async () => {
  const { root, docsRoot } = await fixture('-docs;touch');
  try {
    const repository = await openGitRepository(docsRoot);
    expect(repository.docsRelative).toBe('-docs;touch');
    expect(await repository.status()).toEqual(new Map());
    await expect(repository.resolveCommit('--upload-pack=touch')).rejects.toMatchObject({
      code: 'git-base-not-found',
    });
    await expect(repository.resolveCommit('HEAD --upload-pack=touch')).rejects.toMatchObject({
      code: 'git-base-not-found',
    });
    await expect(
      openGitRepository(docsRoot, { signal: AbortSignal.abort(new Error('cancelled')) }),
    ).rejects.toMatchObject({ code: 'process_aborted' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reads working-tree, index, commit, and binary content without leaving docs scope', async () => {
  const { root, docsRoot, initial } = await fixture();
  try {
    const repository = await openGitRepository(docsRoot);
    await writeFile(join(docsRoot, 'keep.md'), 'working');
    expect(await repository.content({ type: 'commit', resolved: initial }, 'docs/keep.md')).toEqual(
      Buffer.from('keep'),
    );
    expect(await repository.content({ type: 'working-tree' }, 'docs/keep.md')).toEqual(
      Buffer.from('working'),
    );
    await git(root, ['add', '--', 'docs/keep.md']);
    expect(await repository.content({ type: 'index' }, 'docs/keep.md')).toEqual(
      Buffer.from('working'),
    );

    const binary = Buffer.from([0, 1, 2, 255]);
    await writeFile(join(docsRoot, 'binary.bin'), binary);
    await git(root, ['add', '--', 'docs/binary.bin']);
    await git(root, ['commit', '-qm', 'binary']);
    const head = await repository.resolveCommit('HEAD');
    expect(await repository.content({ type: 'commit', resolved: head }, 'docs/binary.bin')).toEqual(
      binary,
    );

    await expect(
      repository.content({ type: 'working-tree' }, 'docs/../docs/keep.md'),
    ).rejects.toMatchObject({
      code: 'git-path-invalid',
    });
    await expect(
      repository.content({ type: 'working-tree' }, 'docs-other/peer.md'),
    ).rejects.toMatchObject({
      code: 'git-path-invalid',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reads task documents from the selected Git side without working-tree fallback', async () => {
  const { root, docsRoot } = await fixture();
  try {
    const workRoot = join(docsRoot, 'work');
    await mkdir(workRoot);
    await writeFile(
      join(workRoot, 'one.md'),
      '<!-- toudocu\nid: TASK-GIT-001\n-->\n# One\n\ncommitted\n',
    );
    await writeFile(join(workRoot, 'two.md'), '<!-- toudocu\nid: BUG-GIT-002\n-->\n# Two\n');
    await writeFile(
      join(root, 'docs-other', 'peer-task.md'),
      '<!-- toudocu\nid: TASK-GIT-999\n-->\n# Peer\n',
    );
    await symlink(join(root, 'docs-other', 'peer-task.md'), join(workRoot, 'peer.md'));
    await git(root, ['add', '--', 'docs/work']);
    await git(root, ['commit', '-qm', 'tasks']);
    const initial = (await git(root, ['rev-parse', 'HEAD'])).trim();

    await writeFile(
      join(workRoot, 'one.md'),
      '<!-- toudocu\nid: TASK-GIT-001\n-->\n# One\n\nindex\n',
    );
    await git(root, ['add', '--', 'docs/work/one.md']);
    await writeFile(join(workRoot, 'three.md'), '<!-- toudocu\nid: TASK-GIT-003\n-->\n# Three\n');
    await rm(join(workRoot, 'two.md'));

    const repository = await openGitRepository(docsRoot);
    const committed = await repository.taskDocuments({ type: 'commit', resolved: initial });
    const indexed = await repository.taskDocuments({ type: 'index' });
    const working = await repository.taskDocuments({ type: 'working-tree' });

    expect([...committed.keys()]).toEqual(['TASK-GIT-001', 'BUG-GIT-002']);
    expect(committed.get('TASK-GIT-001')?.content.toString()).toContain('committed');
    expect([...indexed.keys()]).toEqual(['TASK-GIT-001', 'BUG-GIT-002']);
    expect(indexed.get('TASK-GIT-001')?.content.toString()).toContain('index');
    expect([...working.keys()]).toEqual(['TASK-GIT-001', 'TASK-GIT-003']);
    expect(working.has('BUG-GIT-002')).toBe(false);
    expect(working.has('TASK-GIT-999')).toBe(false);
    expect((await repository.taskDocuments({ type: 'working-tree' }, 'TASK-GIT-003')).size).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects duplicate task identifiers in the selected side', async () => {
  const { root, docsRoot } = await fixture();
  try {
    const workRoot = join(docsRoot, 'work');
    await mkdir(workRoot);
    const duplicate = '<!-- toudocu\nid: TASK-GIT-004\n-->\n# Duplicate\n';
    await writeFile(join(workRoot, 'a.md'), duplicate);
    await writeFile(join(workRoot, 'b.md'), duplicate);
    const repository = await openGitRepository(docsRoot);

    await expect(repository.taskDocuments({ type: 'working-tree' })).rejects.toMatchObject({
      code: 'git-task-ambiguous',
      message: expect.stringContaining('TASK-GIT-004'),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('builds tracked and untracked diffs without shell or external diff', async () => {
  const { root, docsRoot, initial } = await fixture();
  try {
    await writeFile(join(docsRoot, 'keep.md'), 'changed\n');
    const repository = await openGitRepository(docsRoot);
    const tracked = await repository.diff(
      { type: 'commit', resolved: initial },
      { type: 'working-tree' },
      { status: 'modified', path: 'docs/keep.md' },
    );
    expect(tracked.toString()).toContain('-keep');
    expect(tracked.toString()).toContain('+changed');

    await writeFile(join(docsRoot, 'new.md'), 'new\nfile\n');
    const untracked = await repository.diff(
      { type: 'commit', resolved: initial },
      { type: 'working-tree' },
      { status: 'untracked', path: 'docs/new.md' },
    );
    expect(untracked.toString()).toContain('new file mode 100644');
    expect(untracked.toString()).toContain('+new');
    expect(untracked.toString()).toContain('+file');
    await expect(
      repository.diff(
        { type: 'commit', resolved: initial },
        { type: 'working-tree' },
        { status: 'untracked', path: 'docs-other/new.md' },
      ),
    ).rejects.toMatchObject({ code: 'git-path-invalid' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports repository state, merge base, and rejects working-tree symlinks', async () => {
  const { root, docsRoot, initial } = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'toudocu-git-outside-'));
  try {
    const repository = await openGitRepository(docsRoot);
    const clean = await repository.repositoryState();
    expect(clean).toMatchObject({ root, head: initial.slice(0, 7), dirty: false });
    expect(await repository.mergeBase('HEAD', initial)).toBe(initial);
    await writeFile(join(outside, 'secret.md'), 'secret');
    await symlink(join(outside, 'secret.md'), join(docsRoot, 'linked.md'));
    await expect(
      repository.content({ type: 'working-tree' }, 'docs/linked.md'),
    ).rejects.toMatchObject({
      code: 'path_forbidden',
    });
    await writeFile(join(docsRoot, 'keep.md'), 'dirty');
    expect((await repository.repositoryState()).dirty).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
