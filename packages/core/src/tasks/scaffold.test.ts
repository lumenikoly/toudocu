import { describe, expect, test } from 'vitest';
import { renderScaffold, renderTaskInit } from './scaffold.js';

describe('task and entity scaffolding', () => {
  test('reserves numeric prefixes from filenames and metadata', () => {
    const render = renderTaskInit({
      area: 'DOCS',
      title: 'Next task',
      type: 'Maintenance',
      language: 'en',
      date: '2026-09-19',
      entries: [
        { sourcePath: 'work/TASK-DOCS-003-self-documentation.md' },
        { sourcePath: 'work/nested.md', metadataID: 'TASK-DOCS-007-follow-up' },
        { sourcePath: 'work/ignored.md', metadataID: 'TASK-DOCS-not-a-number' },
      ],
    });

    expect(render.id).toBe('TASK-DOCS-008');
  });

  test('rejects a requested parent that is not present', () => {
    expect(() =>
      renderTaskInit({
        area: 'DOCS',
        title: 'Child task',
        type: 'Feature',
        language: 'en',
        parentID: 'TASK-DOCS-001',
        parentExists: false,
        date: '2026-09-19',
        entries: [],
      }),
    ).toThrow('parent task TASK-DOCS-001 not found');
  });

  test('renders every supported entity type in both languages', () => {
    const entities = [
      ['module', 'MOD-EXAMPLE'],
      ['use-case', 'UC-EXAMPLE'],
      ['flow', 'FLOW-EXAMPLE'],
      ['screen', 'SC-EXAMPLE'],
      ['decision', 'ADR-EXAMPLE'],
      ['standard', 'STD-EXAMPLE'],
      ['runbook', 'RB-EXAMPLE'],
    ] as const;

    for (const language of ['en', 'ru'] as const) {
      for (const [entityType, id] of entities) {
        const render = renderScaffold({
          entityType,
          id,
          title: 'Example',
          language,
          date: '2026-09-19',
        });
        expect(render.content).toContain(`# ${id}: Example`);
      }
    }
  });
});
