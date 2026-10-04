import { expect, test } from 'vitest';
import { createDocument, type Document } from '../documents/document.js';
import { compileWorkItems, type RepositoryInventory } from './work-items.js';

const now = new Date('2026-09-19T00:00:00Z');

function document(sourcePath: string, content: string): Document {
  return createDocument({ sourcePath, content, modifiedAt: now }, { now, staleDays: 0 });
}

function repository(paths: readonly string[] = []): RepositoryInventory {
  const available = new Set(paths);
  return {
    exists: (path) => available.has(path) || path === '.',
    matches: (pattern) => [...available].filter((path) => path === pattern),
  };
}

function readyFeature(id = 'TASK-AUTH-100', metadata = ''): string {
  return `<!-- toudocu
id: ${id}
status: ready
taskType: feature
module: MOD-AUTH
useCase: UC-AUTH-01
${metadata}-->
# ${id}: Implement login

Description.

<!-- toudocu:section result -->
## Result

Login is observable.

<!-- toudocu:section behavior-change -->
## Behavior change

<!-- toudocu:section before -->
### Before

The old flow fails.

<!-- toudocu:section after -->
### After

The new flow succeeds.

<!-- toudocu:section scope -->
## Scope

- \`src/auth.ts\`

<!-- toudocu:section out-of-scope -->
## Out of scope

Other providers.

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

- [ ] \`AC-01\` Login succeeds.

<!-- toudocu:section plan -->
## Plan

1. Implement.
2. Verify.

<!-- toudocu:section verification -->
## Verification

- \`AC-01\` -> \`go test ./...\`
- \`ALL\` -> \`go test ./...\`
- \`DOCS\` -> \`go run ./cmd/toudocu check ./docs --strict\`

<!-- toudocu:section documentation-impact -->
## Documentation impact

Update \`docs/index.md\`.
`;
}

test('compiles one valid feature and preserves criteria/verification mappings', () => {
  const result = compileWorkItems(
    [
      document(
        'work/TASK-AUTH-100.md',
        readyFeature().replace(
          '<!-- toudocu:section documentation-impact -->',
          'The DOCS and QUALITY names are discussed here.\n\n<!-- toudocu:section documentation-impact -->',
        ),
      ),
    ],
    repository(['src/auth.ts', 'docs/index.md']),
  );
  expect(result.issues).toEqual([]);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    id: 'TASK-AUTH-100',
    type: 'feature',
    moduleId: 'MOD-AUTH',
    useCaseId: 'UC-AUTH-01',
    parentId: null,
    childIds: [],
    repositoryPaths: ['src/auth.ts'],
    documentationPaths: ['docs/index.md'],
  });
  expect(result.items[0]?.criteria[0]).toMatchObject({ line: 43, completed: false });
  expect(result.items[0]?.verification[0]).toMatchObject({
    criterionId: 'AC-01',
    criterion: 'Login succeeds.',
    commands: ['go test ./...'],
  });
  expect(result.items[0]?.checks.map((check) => check.target)).toEqual(['AC-01', 'ALL', 'DOCS']);
});

test('allows a standalone draft work item and reports work document cardinality', () => {
  const draft = document(
    'work/TASK-AUTH-101.md',
    '<!-- toudocu\nid: TASK-AUTH-101\nstatus: draft\ntaskType: research\n-->' +
      '\n# TASK-AUTH-101: Explore\n\n<!-- toudocu:section result -->\n## Result\n\nQuestion answered.\n',
  );
  const multiple = document(
    'work/TASK-AUTH-102.md',
    '# TASK-AUTH-102: One\n\n<!-- toudocu:section result -->\n## Result\n\nOne.\n\n# TASK-AUTH-103: Two\n',
  );
  const result = compileWorkItems([draft, multiple], repository());
  expect(result.items).toHaveLength(3);
  expect(result.items[0]?.criteria).toEqual([]);
  expect(result.issues.filter((issue) => issue.code === 'work-item-count')).toHaveLength(1);
});

test('computes task hierarchy, catches parent/dependency cycles, and keeps children sorted', () => {
  const parent = document(
    'work/TASK-AUTH-100.md',
    readyFeature('TASK-AUTH-100').replace(
      'useCase: UC-AUTH-01',
      'useCase: UC-AUTH-01\nparentTask: TASK-AUTH-101\ndependsOn: TASK-AUTH-101',
    ),
  );
  const child = document(
    'work/TASK-AUTH-101.md',
    readyFeature('TASK-AUTH-101').replace(
      'useCase: UC-AUTH-01',
      'useCase: UC-AUTH-01\nparentTask: TASK-AUTH-100\ndependsOn: TASK-AUTH-100',
    ),
  );
  const result = compileWorkItems([parent, child], repository(['src/auth.ts', 'docs/index.md']));
  expect(result.items.find((item) => item.id === 'TASK-AUTH-100')?.childIds).toEqual([
    'TASK-AUTH-101',
  ]);
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining(['TASK_PARENT_CYCLE', 'task-dependency-cycle', 'TASK_COMPLETION_CYCLE']),
  );
});

test('retains archival state and rejects unsafe scope paths', () => {
  const source = readyFeature('TASK-AUTH-110').replace('`src/auth.ts`', '`../outside.ts`');
  const result = compileWorkItems(
    [document('work/archive/2026/TASK-AUTH-110.md', source)],
    repository(['docs/index.md']),
  );
  expect(result.items[0]).toMatchObject({ archived: true, archiveYear: '2026' });
  expect(result.issues.map((issue) => issue.code)).toContain('unsafe-scope-path');
});

test('accepts a new scope file directly under the repository root', () => {
  const source = readyFeature('TASK-AUTH-111').replace('`src/auth.ts`', '`new.ts`');
  const result = compileWorkItems(
    [document('work/TASK-AUTH-111.md', source)],
    repository(['docs/index.md']),
  );
  expect(result.items[0]?.repositoryPaths).toEqual(['new.ts']);
  expect(result.issues.map((issue) => issue.code)).not.toContain('missing-scope-path');
});

test('validates bug metadata independently of the ordinary feature contract', () => {
  const bug = document(
    'work/BUG-AUTH-120.md',
    '<!-- toudocu\nid: BUG-AUTH-120\nstatus: ready\ntaskType: bug\nmodule: MOD-AUTH\nuseCase: UC-AUTH-01\nregression: true\n-->\n# BUG-AUTH-120: Broken login\n\nDescription.\n',
  );
  const result = compileWorkItems([bug], repository());
  expect(result.issues.map((issue) => issue.code)).not.toContain('missing-bug-regression-test');
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      'missing-bug-field',
      'missing-regression-version',
      'missing-work-section',
      'missing-bug-reproduction-evidence',
    ]),
  );
});

test.each(['ready', 'done'])(
  'accepts grouped checks without mandatory suite labels for %s tasks',
  (status) => {
    const content = readyFeature('TASK-AUTH-100', 'standards: STD-TS-001\n')
      .replace('status: ready', `status: ${status}`)
      .replace(
        '- [ ] `AC-01` Login succeeds.',
        '- [x] `AC-01` Login succeeds.\n- [x] `AC-02` Session is restored.',
      )
      .replace(
        /- `AC-01` ->[^\n]+\n- `ALL` ->[^\n]+\n- `DOCS` ->[^\n]+/u,
        '- `AC-01`, `AC-02` -> `node -e "(() => true)()"`\n- `AC-01` `node -e "(() => false)()"`',
      );
    const result = compileWorkItems(
      [document('work/TASK-AUTH-100.md', content)],
      repository(['src/auth.ts', 'docs/index.md']),
    );
    expect(result.issues).toEqual([]);
    expect(
      result.items[0]?.verification.map(({ criterionId, commands }) => ({ criterionId, commands })),
    ).toEqual([
      { criterionId: 'AC-01', commands: ['node -e "(() => true)()"', 'node -e "(() => false)()"'] },
      { criterionId: 'AC-02', commands: ['node -e "(() => true)()"'] },
    ]);
  },
);
