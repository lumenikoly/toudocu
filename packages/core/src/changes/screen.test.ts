import { expect, test } from 'vitest';
import { parseMarkdown } from '../markdown/parse.js';
import { buildScreenDiffFromSnapshots, buildScreenDiffMetadata } from './screen.js';

function screenDocument(
  title: string,
  metadata: string,
  rows: string,
): ReturnType<typeof parseMarkdown>['analysis'] {
  return parseMarkdown(
    `<!-- toudocu
id: SC-APP-001
${metadata}-->
# ${title}

<!-- toudocu:table transitions columns=id,target,action,condition,state,error,useCase -->
| ID | Target | Action | Condition | State | Error | Use case |
| --- | --- | --- | --- | --- | --- | --- |
${rows}`,
  ).analysis;
}

test('compares screen metadata and sorted transition changes', () => {
  const before = screenDocument(
    'SC-APP-001: Old title',
    'route: /old\nmodule: MOD-APP\nstatus: active\nscreenKind: page\n',
    '| TR-APP-001 | SC-APP-002 | Open | Always | | | UC-APP-001 |\n' +
      '| TR-APP-003 | SC-APP-004 | Keep | Always | | | UC-APP-001 |\n' +
      '| TR-APP-002 | SC-APP-003 | Remove | Never | | | UC-APP-001 |\n',
  );
  const after = screenDocument(
    'SC-APP-001: New title',
    'route: /new\nmodule: MOD-APP\nstatus: done\nscreenKind: modal\n',
    '| TR-APP-001 | SC-APP-002 | Open | When ready | | | UC-APP-001 |\n' +
      '| TR-APP-003 | SC-APP-004 | Keep | Always | | | UC-APP-001 |\n' +
      '| TR-APP-004 | SC-APP-005 | Add | Always | | | UC-APP-001 |\n',
  );

  expect(buildScreenDiffMetadata(before, after)).toEqual({
    before: {
      id: 'SC-APP-001',
      title: 'Old title',
      route: '/old',
      module: 'MOD-APP',
      status: 'active',
      type: 'page',
    },
    after: {
      id: 'SC-APP-001',
      title: 'New title',
      route: '/new',
      module: 'MOD-APP',
      status: 'done',
      type: 'modal',
    },
    transitions: [
      {
        id: 'TR-APP-001',
        status: 'modified',
        before: {
          id: 'TR-APP-001',
          source: 'SC-APP-001',
          target: 'SC-APP-002',
          action: 'Open',
          condition: 'Always',
          useCase: 'UC-APP-001',
          line: 13,
        },
        after: {
          id: 'TR-APP-001',
          source: 'SC-APP-001',
          target: 'SC-APP-002',
          action: 'Open',
          condition: 'When ready',
          useCase: 'UC-APP-001',
          line: 13,
        },
      },
      {
        id: 'TR-APP-002',
        status: 'removed',
        before: {
          id: 'TR-APP-002',
          source: 'SC-APP-001',
          target: 'SC-APP-003',
          action: 'Remove',
          condition: 'Never',
          useCase: 'UC-APP-001',
          line: 15,
        },
      },
      {
        id: 'TR-APP-004',
        status: 'added',
        after: {
          id: 'TR-APP-004',
          source: 'SC-APP-001',
          target: 'SC-APP-005',
          action: 'Add',
          condition: 'Always',
          useCase: 'UC-APP-001',
          line: 15,
        },
      },
    ],
  });
});

test('reuses changed transition snapshots without re-parsing Markdown', () => {
  const before = screenDocument(
    'SC-APP-001',
    '',
    '| TR-APP-001 | SC-APP-002 | Open | Always | | | |\n',
  );
  const after = screenDocument(
    'SC-APP-001',
    '',
    '| TR-APP-001 | SC-APP-002 | Open | When ready | | | |\n',
  );
  const full = buildScreenDiffMetadata(before, after);

  expect(buildScreenDiffFromSnapshots(full.before, full.after, full, full)).toEqual(full);
});
