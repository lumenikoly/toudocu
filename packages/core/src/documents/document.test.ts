import { describe, expect, it } from 'vitest';
import {
  classifyDocument,
  createDocument,
  outputPathForDocument,
  statusFor,
  type DocumentSource,
} from './document.js';

const modifiedAt = new Date('2026-09-01T12:00:00.000Z');
const now = new Date('2026-09-20T23:00:00.000Z');

function source(sourcePath: string, content: string): DocumentSource {
  return { sourcePath, content, modifiedAt };
}

describe('semantic document creation', () => {
  it('treats prototype names as ordinary unknown statuses and preserves early ISO years', () => {
    expect(statusFor('__proto__').recognized).toBe(false);
    expect(statusFor('constructor').recognized).toBe(false);
    const document = createDocument(
      source('notes.md', '<!-- toudocu\nupdated: 0099-01-02\n-->\n# Notes'),
      { now, staleDays: 0 },
    );
    expect(document.updatedAt.toISOString()).toBe('0099-01-02T00:00:00.000Z');
  });
  it('projects parsed Markdown into a pure document with metadata, tasks, dates, and progress', () => {
    const document = createDocument(
      source(
        'work/TASK-ARCH-001.md',
        `<!-- toudocu
status: in-progress
updated: 2026-09-10
-->
# Release plan

Introductory description.

## Checklist

- [x] Build the parser.
- [ ] Verify the output.
`,
      ),
      { now, staleDays: 7 },
    );

    expect(document.id).toBe('work/TASK-ARCH-001.md');
    expect(document.sourcePath).toBe('work/TASK-ARCH-001.md');
    expect(document.outputPath).toBe('work/TASK-ARCH-001.html');
    expect(document.directory).toBe('work');
    expect(document.fileName).toBe('TASK-ARCH-001.md');
    expect(document.type).toBe('work');
    expect(document.sectionType).toBe('work');
    expect(document.title).toBe('Release plan');
    expect(document.description).toBe('Introductory description.');
    expect(document.metadata).toEqual({ status: 'in-progress', updated: '2026-09-10' });
    expect(document.status).toEqual({
      kind: 'in-progress',
      symbol: '=',
      label: 'in-progress',
      recognized: true,
    });
    expect(document.tasks.map((task) => [task.completed, task.text])).toEqual([
      [true, 'Build the parser.'],
      [false, 'Verify the output.'],
    ]);
    expect(document.taskStats).toEqual({ total: 2, completed: 1, remaining: 1, percent: 50 });
    expect(document.updatedAt).toEqual(new Date('2026-09-10T00:00:00.000Z'));
    expect(document.modifiedAt).toEqual(modifiedAt);
    expect(document.ageDays).toBe(10);
    expect(document.stale).toBe(true);
    expect(document.diagnostics).toEqual([]);
  });

  it('uses date as the legacy fallback and modifiedAt when dates are invalid', () => {
    const dated = createDocument(
      source('notes.md', '<!-- toudocu\ndate: 2026-09-19\n-->\n# Notes\n'),
      { now, staleDays: 0 },
    );
    expect(dated.updatedAt).toEqual(new Date('2026-09-19T00:00:00.000Z'));
    expect(dated.ageDays).toBe(1);
    expect(dated.stale).toBe(false);

    const invalid = createDocument(
      source('notes.md', '<!-- toudocu\nupdated: not-a-date\ndate: 2026-09-19\n-->\n# Notes\n'),
      { now, staleDays: 1 },
    );
    expect(invalid.updatedAt).toEqual(modifiedAt);
    expect(invalid.ageDays).toBe(19);

    const future = createDocument(source('notes.md', '# Notes\n'), {
      now: new Date('2026-09-01T00:00:00Z'),
      staleDays: 0,
    });
    expect(Object.is(future.ageDays, -0)).toBe(false);
    expect(future.ageDays).toBe(0);
    expect(invalid.stale).toBe(true);
  });

  it('falls back to a humanized filename when the Markdown has no H1', () => {
    const document = createDocument(source('architecture/decision-record.md', 'Body only\n'), {
      now,
      staleDays: 7,
    });
    expect(document.title).toBe('Decision record');
    expect(document.description).toBe('');
  });

  it('normalizes path separators and preserves output extension behavior', () => {
    expect(
      createDocument(source('MODULES/Example.md', '# Module'), { now, staleDays: 0 }).sectionType,
    ).toBe('modules');
    const document = createDocument(source('use-cases\\login.MD', '# Login\n'), {
      now,
      staleDays: 7,
    });
    expect(document.sourcePath).toBe('use-cases/login.MD');
    expect(document.outputPath).toBe('use-cases/login.html');
    expect(document.directory).toBe('use-cases');
    expect(outputPathForDocument('README.txt')).toBe('README.txt.html');
  });
});

describe('legacy document classification and statuses', () => {
  it('keeps special files and section-specific filename rules', () => {
    const cases: Array<[string, string]> = [
      ['index.md', 'overview'],
      ['status.md', 'status'],
      ['roadmap.md', 'roadmap'],
      ['risks.md', 'risks'],
      ['notes.md', 'notes'],
      ['ideas.md', 'ideas'],
      ['use-cases/login.md', 'use-case'],
      ['modules/auth.md', 'module'],
      ['architecture/overview.md', 'architecture'],
      ['contracts/index.md', 'contract'],
      ['decisions/adr.md', 'decision'],
      ['flows/login.md', 'flow'],
      ['guides/setup.md', 'guide'],
      ['drafts/idea.md', 'draft'],
      ['reference/api.md', 'reference'],
      ['quality/index.md', 'quality-index'],
      ['quality/STD-DOCS-001.md', 'standard'],
      ['runbooks/index.md', 'runbook-index'],
      ['runbooks/RB-DEPLOY.md', 'runbook'],
      ['screens/map.md', 'screen-map'],
      ['screens/index.md', 'screen-index'],
      ['screens/SC-LOGIN.md', 'screen'],
      ['work/TASK-001.md', 'work'],
      ['work/BUG-001.md', 'work'],
      ['other/index.md', 'document'],
    ];
    for (const [path, expected] of cases) expect(classifyDocument(path)).toBe(expected);
  });

  it('maps every canonical status and preserves unknown labels', () => {
    const expected: Array<[string, string, string, string]> = [
      ['draft', 'not-started', '-'],
      ['ready', 'planned', '~'],
      ['planned', 'planned', '~'],
      ['proposed', 'planned', '~'],
      ['in-progress', 'in-progress', '='],
      ['active', 'in-progress', '='],
      ['blocked', 'blocked', '!'],
      ['paused', 'paused', '='],
      ['done', 'done', '+'],
      ['open', 'open', '-'],
      ['accepted', 'accepted', '+'],
      ['rejected', 'rejected', 'x'],
      ['cancelled', 'cancelled', 'x'],
      ['superseded', 'superseded', '>'],
      ['obsolete', 'obsolete', 'x'],
      ['review-required', 'review-required', '!'],
      ['risk-accepted', 'risk-accepted', '='],
    ];
    for (const [label, kind, symbol] of expected)
      expect(statusFor(label)).toEqual({ kind, symbol, label, recognized: true });
    expect(statusFor('  ')).toEqual({ kind: 'neutral', symbol: '.', label: '', recognized: true });
    expect(statusFor('custom')).toEqual({
      kind: 'neutral',
      symbol: '.',
      label: 'custom',
      recognized: false,
    });
  });
});
