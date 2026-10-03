import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { runCLI } from './cli.js';

const config = `documentationVersion: 3
project:
  defaultLocale: en
locales:
  en:
    root: docs
    sections:
      architecture: Architecture
      modules: Modules
      use-cases: Use cases
      flows: Flows
      screens: Screens
      decisions: Decisions
      contracts: Contracts
      quality: Quality
      runbooks: Runbooks
      reference: Reference
      work: Work
      drafts: Drafts
      guides: Guides
`;

const task = `<!-- toudocu
id: TASK-AUTH-021
status: done
taskType: feature
module: MOD-AUTH
useCase: UC-AUTH-01
-->

# TASK-AUTH-021: Add verification workflow

<!-- toudocu:section result -->
## Result

The requested behavior is implemented.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The workflow is unavailable.

<!-- toudocu:section after -->
### After

The workflow is available and verified.

<!-- toudocu:section scope -->
## Scope

- \`new.go\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Unrelated commands.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [x] \`AC-01\` The workflow succeeds.

<!-- toudocu:section plan -->
## Plan

1. Implement the workflow.
2. Verify the result.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`go version\`
- \`ALL\` -> \`go version\`
- \`DOCS\` -> \`go version\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/index.md\`.
`;

async function createFixture(): Promise<{ root: string; docs: string }> {
  const root = await mkdtemp(join(tmpdir(), 'toudocu-task-archive-parity-'));
  const docs = join(root, 'docs');
  await mkdir(join(root, '.toudocu'), { recursive: true });
  await mkdir(join(docs, 'modules'), { recursive: true });
  await mkdir(join(docs, 'use-cases'), { recursive: true });
  await mkdir(join(docs, 'work'), { recursive: true });
  await writeFile(join(root, '.toudocu', 'config.yml'), config);
  await writeFile(join(docs, 'index.md'), '# Docs\n');
  await writeFile(
    join(docs, 'modules', 'MOD-AUTH.md'),
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth\n',
  );
  await writeFile(
    join(docs, 'use-cases', 'UC-AUTH-01.md'),
    '<!-- toudocu\nid: UC-AUTH-01\nstatus: done\n-->\n# Auth workflow\n',
  );
  await writeFile(join(docs, 'work', 'TASK-AUTH-021.md'), task);
  return { root, docs };
}

async function runTypeScript(root: string, operation: string): Promise<unknown> {
  let output = '';
  let errors = '';
  const code = await runCLI(
    [
      'task',
      operation,
      'TASK-AUTH-021',
      join(root, 'docs'),
      '--repository-root',
      root,
      '--format',
      'json',
    ],
    (value) => {
      output += value;
    },
    (value) => {
      errors += value;
    },
  );
  expect(errors).toBe('');
  expect(code).toBe(0);
  return JSON.parse(output);
}

test('archives and restores a task without changing its bytes', async () => {
  const value = await createFixture();
  try {
    const archived = await runTypeScript(value.root, 'archive');
    expect(archived).toMatchObject({
      schemaVersion: 1,
      status: 'archived',
      task: { id: 'TASK-AUTH-021' },
    });
    await expect(readFile(join(value.docs, 'work', 'TASK-AUTH-021.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    const restored = await runTypeScript(value.root, 'restore');
    expect(restored).toMatchObject({
      schemaVersion: 1,
      status: 'restored',
      task: { id: 'TASK-AUTH-021' },
    });
    expect(await readFile(join(value.docs, 'work', 'TASK-AUTH-021.md'), 'utf8')).toBe(task);
  } finally {
    await rm(value.root, { recursive: true, force: true });
  }
});
