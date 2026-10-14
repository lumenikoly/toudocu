import { expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { loadSkillBundle } from './index.js';
import checkCapture from '../../../fixtures/expected/compatibility/check.json' with { type: 'json' };
import verifyCapture from '../../../fixtures/expected/compatibility/task-verify-dry-run.json' with { type: 'json' };

const helper = fileURLToPath(
  new URL('../../../skills/toudocu/scripts/report-summary.mjs', import.meta.url),
);
function summarize(mode: string, input: string, ...args: string[]) {
  return spawnSync(process.execPath, [helper, mode, ...args], {
    input,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 64 * 1024,
  });
}
function fixture(capture: { stdout: string }): Record<string, unknown> {
  return JSON.parse(capture.stdout.replaceAll('"<DURATION>"', '0')) as Record<string, unknown>;
}

test('compact check excludes large project bodies and exposes every diagnostic page', () => {
  const report = fixture(checkCapture);
  const stats = report.stats as Record<string, unknown>;
  stats.stdout = 'NESTED_BODY';
  report.knowledge = { unrelated: 'UNNEEDED_MODEL'.repeat(100_000) };
  report.issues = Array.from({ length: 7 }, (_, index) => ({
    severity: index === 6 ? 'error' : 'warning',
    code: `ISSUE-${index}`,
    message: 'Inspect this source.',
    documentPath: 'source.md',
    line: index + 1,
    stdout: 'NESTED_BODY',
    ...(index === 6 ? { migration: 'v1-to-v2' } : {}),
  }));
  const raw = JSON.stringify(report);
  const first = summarize('check', raw);
  expect(first.status).toBe(0);
  expect(first.stderr).toBe('');
  expect(first.stdout).not.toContain('UNNEEDED_MODEL');
  expect(first.stdout).not.toContain('NESTED_BODY');
  const summary = JSON.parse(first.stdout);
  expect(summary).not.toHaveProperty('knowledge');
  expect(summary).not.toHaveProperty('documents');
  expect(summary).toMatchObject({
    stats: { documents: stats.documents, errors: stats.errors, warnings: stats.warnings },
    diagnosticCounts: { error: 1, warning: 6, info: 0 },
    issues: { total: 7, offset: 0, nextOffset: 5 },
  });
  expect(summary.issues.items).toHaveLength(5);
  const next = summarize('check', raw, '5', '5');
  expect(next.status).toBe(0);
  expect(JSON.parse(next.stdout).issues).toMatchObject({
    total: 7,
    offset: 5,
    nextOffset: null,
    items: [{ code: 'ISSUE-5' }, { code: 'ISSUE-6', migration: 'v1-to-v2', line: 7 }],
  });
});

test('verification keeps command and failure outcomes but excludes large logs', () => {
  const report = fixture(verifyCapture);
  const task = report.task as Record<string, unknown>;
  const expectedSummary = { ...(report.summary as Record<string, unknown>) };
  task.stdout = 'NESTED_BODY';
  (task.status as Record<string, unknown>).markdown = 'NESTED_BODY';
  (report.summary as Record<string, unknown>).stderr = 'NESTED_BODY';
  const commands = report.commands as Record<string, unknown>[];
  commands[0] = {
    ...commands[0],
    stdout: 'UNNEEDED_STDOUT'.repeat(100_000),
    stderr: 'UNNEEDED_STDERR'.repeat(100_000),
    status: 'failed',
    exitCode: 1,
  };
  report.status = 'failed';
  const result = summarize('verify', JSON.stringify(report));
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  expect(result.stdout).not.toContain('UNNEEDED_STDOUT');
  expect(result.stdout).not.toContain('UNNEEDED_STDERR');
  expect(result.stdout).not.toContain('NESTED_BODY');
  const summary = JSON.parse(result.stdout);
  expect(summary).toMatchObject({ status: 'failed', mode: report.mode, summary: expectedSummary });
  expect(summary.commands.items[0]).toMatchObject({
    command: commands[0].command,
    status: 'failed',
    exitCode: 1,
  });
  expect(summary.commands.items[0]).not.toHaveProperty('stdout');
  expect(summary.commands.items[0]).not.toHaveProperty('stderr');
  expect(Buffer.byteLength(result.stdout)).toBeLessThan(12 * 1024);
});

test('target-only success remains visibly partial and preserves verification scope', () => {
  const report = fixture(verifyCapture);
  report.status = 'passed';
  report.mode = 'run';
  report.target = 'AC-01';
  report.fullVerification = false;
  report.criteria = [
    { id: 'AC-01', description: 'Selected', documentCompleted: true, status: 'passed' },
    { id: 'AC-02', description: 'Not selected', documentCompleted: false, status: 'excluded' },
  ];
  const result = summarize('verify', JSON.stringify(report));
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    status: 'passed',
    target: 'AC-01',
    fullVerification: false,
    criteria: {
      total: 2,
      items: [
        { id: 'AC-01', status: 'passed' },
        { id: 'AC-02', status: 'excluded' },
      ],
    },
  });
});

test('invalid, unsupported or oversized presentations fail explicitly without partial output', () => {
  const check = fixture(checkCapture);
  const verify = fixture(verifyCapture);
  for (const [mode, input, args] of [
    ['check', '{broken', []],
    ['check', ' '.repeat(16 * 1024 * 1024 + 1), []],
    ['check', '{"schemaVersion":99}', []],
    ['verify', JSON.stringify(check), []],
    ['verify', JSON.stringify({ ...verify, fullVerification: 'yes' }), []],
    ['verify', JSON.stringify({ ...verify, target: { stdout: 'NESTED_BODY' } }), []],
    ['check', JSON.stringify(check), ['0', '0']],
    ['check', JSON.stringify(check), ['-1']],
    ['check', JSON.stringify(check), ['0', '21']],
    [
      'check',
      JSON.stringify({
        ...check,
        issues: [{ severity: 'error', code: 'BIG', message: 'Ж'.repeat(7_000) }],
      }),
      [],
    ],
    [
      'check',
      JSON.stringify({
        ...check,
        issues: [{ severity: 'unknown', code: 'BAD', message: 'Invalid severity' }],
      }),
      [],
    ],
  ] as const) {
    const result = summarize(mode, input, ...args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  }
});

test('skill routes have existing references and a bounded task-edit reading budget', async () => {
  const bundle = await loadSkillBundle();
  const files = new Map(bundle.files.map((file) => [file.path, file]));
  const taskEdit = [
    'SKILL.md',
    'references/task-workflow.md',
    'references/work-item-model.md',
    'references/writing-quality.md',
    'references/semantic-gate.md',
  ];
  expect(taskEdit.reduce((bytes, path) => bytes + files.get(path)!.data.length, 0)).toBeLessThan(
    21_000,
  );
  expect(files.get('scripts/report-summary.mjs')?.mode).toBe(0o755);
  for (const file of bundle.files.filter(
    (entry) => entry.path === 'SKILL.md' || entry.path.startsWith('references/'),
  )) {
    const content = new TextDecoder().decode(file.data);
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/gu)) {
      const target = match[1]!.split('#')[0]!;
      if (!target.endsWith('.md') || /^[a-z]+:/iu.test(target) || target.includes('<')) continue;
      const path = posix.normalize(posix.join(posix.dirname(file.path), target));
      expect(files.has(path), `${file.path} links to missing ${path}`).toBe(true);
    }
  }
});
