import { expect, test } from 'vitest';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runCLI } from './cli.js';
import baseline from '../../../fixtures/expected/compatibility/check.json' with { type: 'json' };
import readyBaseline from '../../../fixtures/expected/compatibility/task-ready.json' with { type: 'json' };
import candidatesBaseline from '../../../fixtures/expected/compatibility/task-candidates.json' with { type: 'json' };
import treeBaseline from '../../../fixtures/expected/compatibility/task-tree.json' with { type: 'json' };
import contextBaseline from '../../../fixtures/expected/compatibility/task-context.json' with { type: 'json' };
import verifyBaseline from '../../../fixtures/expected/compatibility/task-verify-dry-run.json' with { type: 'json' };
import { formatLocalDate } from './date.js';

async function run(args: string[]) {
  let stdout = '',
    stderr = '';
  const code = await runCLI(
    args,
    (value) => {
      stdout += value;
    },
    (value) => {
      stderr += value;
    },
  );
  return { code, stdout, stderr };
}

test('bare invocation and root help list commands without requiring a project', async () => {
  const result = await run([]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('Usage:\n  toudocu <command> [options]');
  for (const command of [
    'check',
    'serve',
    'task context',
    'changes file',
    'project info',
    'capabilities',
    'version',
  ]) {
    expect(result.stdout).toContain(`  ${command} `);
  }
  expect(await run(['--help'])).toEqual(result);
  expect(await run(['-h'])).toEqual(result);
});

test('unknown commands report an error with a root help hint', async () => {
  for (const args of [['unknown'], ['unknown', '--help']]) {
    expect(await run(args)).toEqual({
      code: 2,
      stdout: '',
      stderr: "Error: unknown command 'unknown'. Run toudocu --help for available commands.\n",
    });
  }
  const result = await run(['check', '--help']);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).toContain('toudocu check [docs-dir]');
});

test('formats creation dates from the local calendar', () => {
  const localMorning = new Date(2026, 8, 19, 0, 30);

  expect(formatLocalDate(localMorning)).toBe('2026-09-19');
});

test('task read commands preserve full legacy JSON and exit codes', async () => {
  for (const fixture of [readyBaseline, candidatesBaseline, treeBaseline, contextBaseline]) {
    const result = await run([
      ...fixture.args.map((arg) => (arg === 'docs' ? 'fixtures/projects/compat-basic/docs' : arg)),
      '--repository-root',
      'fixtures/projects/compat-basic',
    ]);
    expect(result.code).toBe(fixture.exitCode);
    expect(result.stderr).toBe(fixture.stderr);
    const normalized = JSON.parse(result.stdout);
    normalized.generator.version = '<VERSION>';
    expect(JSON.stringify(normalized, null, 2) + '\n').toBe(fixture.stdout);
  }
  const missing = await run([
    'task',
    'ready',
    'TASK-MISSING-999',
    'fixtures/projects/compat-basic/docs',
    '--format=json',
  ]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toBe('');
  expect(JSON.parse(missing.stdout)).toMatchObject({
    status: 'contract_incomplete',
    issues: [{ code: 'task-selection-failed' }],
  });
  expect(
    await run([
      'task',
      'tree',
      'TASK-MISSING-999',
      'fixtures/projects/compat-basic/docs',
      '--format=json',
    ]),
  ).toEqual({ code: 1, stdout: '', stderr: 'Error: task TASK-MISSING-999 not found\n' });
});

test('task verify dry-run preserves the legacy JSON corpus without executing commands', async () => {
  const result = await run([
    ...verifyBaseline.args.map((arg) =>
      arg === 'docs' ? 'fixtures/projects/compat-basic/docs' : arg,
    ),
    '--repository-root',
    'fixtures/projects/compat-basic',
  ]);
  expect(result.code).toBe(verifyBaseline.exitCode);
  expect(result.stderr).toBe(verifyBaseline.stderr);
  const normalized = JSON.parse(result.stdout);
  normalized.generator.version = '<VERSION>';
  normalized.startedAt = '<TIMESTAMP>';
  normalized.finishedAt = '<TIMESTAMP>';
  normalized.durationMillis = '<DURATION>';
  for (const command of normalized.commands) {
    command.startedAt = '<TIMESTAMP>';
    command.finishedAt = '<TIMESTAMP>';
    command.durationMillis = '<DURATION>';
  }
  expect(JSON.stringify(normalized, null, 2) + '\n').toBe(verifyBaseline.stdout);
});

async function writeVerifyFixture(root: string, command: string): Promise<void> {
  await mkdir(join(root, 'docs', 'work'), { recursive: true });
  await mkdir(join(root, 'docs', 'modules'), { recursive: true });
  await mkdir(join(root, '.toudocu'), { recursive: true });
  await writeFile(
    join(root, '.toudocu', 'config.yml'),
    `documentationVersion: 3
project:
  defaultLocale: en
locales:
  en:
    root: docs
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use Cases
      flows: Processes
      screens: Screens
      decisions: Decisions
      contracts: Contracts
      quality: Quality
      runbooks: Runbooks
      reference: Reference
      work: Work Items
      drafts: Drafts
      guides: Guides
`,
  );
  await writeFile(join(root, 'docs', 'index.md'), '# Project\n');
  await writeFile(
    join(root, 'docs', 'modules', 'core.md'),
    '<!-- toudocu\nid: MOD-CORE\nstatus: active\n-->\n# Core\n',
  );
  await writeFile(join(root, 'docs', 'guide.md'), '# Guide\n');
  await writeFile(
    join(root, 'docs', 'work', 'TASK-VERIFY-CLI-001.md'),
    `<!-- toudocu
id: TASK-VERIFY-CLI-001
status: ready
taskType: maintenance
module: MOD-CORE
updated: 2026-09-01
-->
# TASK-VERIFY-CLI-001: Run a harmless command

<!-- toudocu:section result -->
## Result

The command runs.

<!-- toudocu:section use-case-omission-reason -->
## Use case omission reason

This maintenance task has no user-facing behavior.

<!-- toudocu:section scope -->
## Scope

- \`docs/guide.md\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Unrelated changes.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] \`AC-01\` The command runs.

<!-- toudocu:section plan -->
## Plan

Run the harmless command.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`${command}\`
- \`ALL\` -> \`${command}\`
- \`DOCS\` -> \`${command}\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/guide.md\`.
`,
  );
}

test('task verify run executes only the selected harmless temp command', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-cli-verify-'));
  try {
    await writeVerifyFixture(
      root,
      `node -e "require('node:fs').writeFileSync('verify-marker', 'ok')"`,
    );
    const result = await run([
      'task',
      'verify',
      'TASK-VERIFY-CLI-001',
      join(root, 'docs'),
      '--run',
      '--repository-root',
      root,
      '--format',
      'json',
      '--timeout',
      '10s',
    ]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'passed', mode: 'run' });
    expect(await readFile(join(root, 'verify-marker'), 'utf8')).toBe('ok');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('task verify abort stops an in-flight command before producing a report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-cli-abort-'));
  const controller = new AbortController();
  let stdout = '';
  let stderr = '';
  try {
    await writeVerifyFixture(
      root,
      `node -e "require('node:fs').writeFileSync('verify-started', 'ok'); setInterval(() => {}, 1000)"`,
    );
    const pending = runCLI(
      [
        'task',
        'verify',
        'TASK-VERIFY-CLI-001',
        join(root, 'docs'),
        '--run',
        '--repository-root',
        root,
        '--format',
        'json',
      ],
      (value) => {
        stdout += value;
      },
      (value) => {
        stderr += value;
      },
      controller.signal,
    );
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await readFile(join(root, 'verify-started'), 'utf8');
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    controller.abort(new Error('test cancellation'));
    expect(await pending).toBe(130);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('read commands return clean JSON, and invalid arguments never contaminate stdout', async () => {
  const report = await run([
    'check',
    'fixtures/projects/compat-basic/docs',
    '--repository-root',
    'fixtures/projects/compat-basic',
    '--format',
    'json',
    '--stale-days',
    '0',
  ]);
  expect(report.code).toBe(0);
  expect(report.stderr).toBe('');
  expect(JSON.parse(report.stdout)).toMatchObject({
    schemaVersion: 1,
    stats: { documents: 6, errors: 0 },
  });
  const normalized = JSON.parse(report.stdout);
  normalized.generator.version = '<VERSION>';
  normalized.generatedAt = '<TIMESTAMP>';
  expect(JSON.stringify(normalized, null, 2) + '\n').toBe(baseline.stdout);
  const search = await run([
    'search',
    'compatibility',
    'fixtures/projects/compat-basic/docs',
    '--format=json',
  ]);
  expect(search.code).toBe(0);
  expect(search.stderr).toBe('');
  expect(JSON.parse(search.stdout)).toMatchObject({ kind: 'search', total: 5 });
  expect(await run(['check', '--unknown-option'])).toEqual({
    code: 1,
    stdout: '',
    stderr: 'Error: unknown option: --unknown-option\n',
  });
  expect(await run(['check', '--format'])).toEqual({
    code: 1,
    stdout: '',
    stderr: 'Error: option --format requires a value\n',
  });
  expect(await run(['search', '---'])).toMatchObject({ code: 1, stdout: '' });
});
test('check reports errors in JSON with nonzero exit rather than throwing away the report', async () => {
  const result = await run([
    'check',
    'fixtures/markdown/security-url/docs',
    '--format=json',
    '--stale-days=0',
  ]);
  expect(result.code).toBe(1);
  expect(result.stderr).toBe('');
  expect(JSON.parse(result.stdout).issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'forbidden-raw-html' })]),
  );
});

test('debug diagnostics stay on stderr while JSON stdout remains valid', async () => {
  const args = ['check', 'fixtures/projects/compat-basic/docs', '--format', 'json'];
  const quiet = await run(args);
  expect(quiet.code).toBe(0);
  expect(quiet.stderr).toBe('');
  expect(JSON.parse(quiet.stdout)).toMatchObject({ schemaVersion: 1 });

  const debug = await run([...args, '--debug']);
  expect(debug.code).toBe(0);
  expect(JSON.parse(debug.stdout)).toMatchObject({ schemaVersion: 1 });
  expect(debug.stderr).toContain('"level":"debug"');
  expect(debug.stderr).not.toContain('"level":"error"');

  const invalid = await run(['check', '--unknown-option']);
  expect(invalid.code).toBe(1);
  expect(invalid.stdout).toBe('');
  expect(invalid.stderr).not.toContain('at runCLI');

  const invalidDebug = await run(['check', '--unknown-option', '--debug']);
  expect(invalidDebug.code).toBe(1);
  expect(invalidDebug.stdout).toBe('');
  expect(invalidDebug.stderr).toContain('"level":"error"');
  expect(invalidDebug.stderr).toContain('at runCLI');

  const positionalDebug = await run(['search', '--format', 'json', '--', '--debug']);
  expect(positionalDebug.code).toBe(0);
  expect(JSON.parse(positionalDebug.stdout)).toMatchObject({ kind: 'search' });
  expect(positionalDebug.stderr).not.toContain('"level":"debug"');
}, 15_000);

test('an already aborted CLI signal prevents project reads', async () => {
  let stdout = '';
  let stderr = '';
  const code = await runCLI(
    ['check', 'fixtures/projects/compat-basic/docs', '--format', 'json'],
    (value) => {
      stdout += value;
    },
    (value) => {
      stderr += value;
    },
    AbortSignal.abort(),
  );

  expect(code).toBe(130);
  expect(stdout).toBe('');
  expect(stderr).toBe('');
});

test('an in-flight CLI abort returns the conventional signal code', async () => {
  for (const [signalName, expectedCode] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
  ] as const) {
    const controller = new AbortController();
    let stdout = '';
    let stderr = '';
    const pending = runCLI(
      ['check', 'fixtures/projects/compat-basic/docs', '--format', 'json'],
      (value) => {
        stdout += value;
      },
      (value) => {
        stderr += value;
      },
      controller.signal,
    );
    const reason = Object.assign(new Error(`received ${signalName}`), { signal: signalName });
    controller.abort(reason);

    expect(await pending).toBe(expectedCode);
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  }
});

test('serve abort closes the HTTP server and watcher', async () => {
  const controller = new AbortController();
  let resolveAddress!: (address: string) => void;
  const address = new Promise<string>((resolve) => {
    resolveAddress = resolve;
  });
  const pending = runCLI(
    [
      'serve',
      'fixtures/projects/compat-basic/docs',
      '--repository-root',
      'fixtures/projects/compat-basic',
      '--port',
      '0',
      '--no-update-check',
    ],
    (value) => {
      const match = /started at (http:\/\/[^\s]+)/u.exec(value);
      if (match?.[1]) resolveAddress(match[1]);
    },
    () => {},
    controller.signal,
  );
  const serverAddress = await address;
  await expect(fetch(`${serverAddress}/_toudocu/api/state`)).resolves.toMatchObject({ ok: true });

  controller.abort(Object.assign(new Error('received SIGINT'), { signal: 'SIGINT' }));
  await expect(pending).resolves.toBe(130);
  await expect(fetch(`${serverAddress}/_toudocu/api/state`)).rejects.toThrow();
}, 15_000);

test('skill status and install use the selected project target', async () => {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-skill-cli-'));
  try {
    const args = ['skill', 'status', '--agent', 'codex', '--repository-root', root];
    const before = await run(args);
    expect(before.code).toBe(0);
    expect(before.stdout).toContain('not-installed');
    expect(before.stderr).toBe('');

    const installed = await run([
      'skill',
      'install',
      '--agent',
      'codex',
      '--repository-root',
      root,
    ]);
    expect(installed.code).toBe(0);
    expect(installed.stdout).toContain('installed');
    expect(installed.stderr).toBe('');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15_000);
