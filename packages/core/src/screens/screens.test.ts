import { describe, expect, it } from 'vitest';
import { createDocument, type Document, type DocumentSource } from '../documents/document.js';
import {
  compileScreens,
  type ScreenCriterionVerification,
  type ScreenWorkItemRecord,
} from './screens.js';

const now = new Date('2026-09-19T00:00:00.000Z');

function document(sourcePath: string, content: string): Document {
  const source: DocumentSource = { sourcePath, content, modifiedAt: now };
  return createDocument(source, { now, staleDays: 7 });
}

function screen(id: string, route: string, extra = '', transitions = ''): Document {
  return document(
    `screens/${id}.md`,
    `<!-- toudocu
id: ${id}
screenKind: page
module: MOD-AUTH
status: planned
route: ${route}
${extra}-->
# ${id} title

${transitions}`,
  );
}

function useCase(): Document {
  return document(
    'use-cases/login.md',
    `<!-- toudocu
id: UC-AUTH-01
startScreen: SC-AUTH-HOME
terminalScreens: SC-AUTH-LOGIN
screens: SC-AUTH-HOME, SC-AUTH-LOGIN
allowCycle: false
-->
# Login flow

<!-- toudocu:section postconditions -->
## Result

The user is signed in.
`,
  );
}

function transitionTable(rows: string): string {
  return `<!-- toudocu:table transitions columns=id,useCase,action,condition,target,state,error,message,contract,kind -->
| ID | Use case | Action | Condition | Target | State | Error | Message | Contract | Kind |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}`;
}

describe('screen compiler', () => {
  it('compiles screens, transitions, and a playable flow from semantic documents', () => {
    const home = screen(
      'SC-AUTH-HOME',
      '/',
      '',
      transitionTable(
        '| TR-AUTH-001 | UC-AUTH-01 | Open login | Always | SC-AUTH-LOGIN | | | | | navigation |',
      ),
    );
    const login = screen('SC-AUTH-LOGIN', '/login');
    const result = compileScreens([
      document('modules/auth.md', '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth'),
      home,
      login,
      useCase(),
    ]);

    expect(result.screens.map((value) => value.id)).toEqual(['SC-AUTH-HOME', 'SC-AUTH-LOGIN']);
    expect(result.transitions).toMatchObject([
      { id: 'TR-AUTH-001', fromID: 'SC-AUTH-HOME', toID: 'SC-AUTH-LOGIN' },
    ]);
    expect(result.playableFlows).toMatchObject([
      {
        useCaseID: 'UC-AUTH-01',
        startScreenID: 'SC-AUTH-HOME',
        reachableScreens: ['SC-AUTH-HOME', 'SC-AUTH-LOGIN'],
        terminalScreens: ['SC-AUTH-LOGIN'],
        transitionIDs: ['TR-AUTH-001'],
        result: 'The user is signed in.',
        valid: true,
      },
    ]);
    expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.screens.find((value) => value.id === 'SC-AUTH-HOME')?.useCaseIDs).toEqual([
      'UC-AUTH-01',
    ]);
  });

  it('reports duplicate identity, route, and dangling graph references', () => {
    const first = screen('SC-AUTH-HOME', '/same');
    const duplicate = screen('SC-AUTH-HOME', '/same');
    const result = compileScreens([
      first,
      duplicate,
      document('modules/auth.md', '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth'),
      document(
        'use-cases/broken.md',
        `<!-- toudocu
id: UC-BROKEN-01
startScreen: SC-MISSING
terminalScreens: SC-MISSING
screens: SC-MISSING
-->
# Broken flow`,
      ),
    ]);

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'duplicate-screen-id',
        'duplicate-screen-route',
        'missing-flow-start-screen',
        'unknown-flow-terminal-screen',
        'dangling-screen-reference',
      ]),
    );
  });

  it('validates transition tables, injected assets, and hotspots', () => {
    const home = screen(
      'SC-AUTH-HOME',
      '/',
      'preview: previews/home.png\ncomponent: ui/home.tsx\n',
      transitionTable(
        '| TR-AUTH-001 | UC-AUTH-01 | Open | Always | SC-MISSING | | | | | navigation |',
      ),
    );
    const result = compileScreens([home], {
      assets: {
        previews: new Map([['previews/home.png', { status: 'missing' as const }]]),
        components: new Map([['ui/home.tsx', 'outside' as const]]),
      },
      hotspots: [
        {
          screen: 'SC-AUTH-HOME',
          transition: 'TR-MISSING-999',
          x: 90,
          y: 90,
          width: 20,
          height: 20,
        },
      ],
    });

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missing-screen-preview',
        'unsafe-screen-component',
        'dangling-screen-reference',
        'unknown-hotspot-transition',
        'invalid-hotspot-bounds',
      ]),
    );
    expect(result.screens[0]?.preview).toBe('');
    expect(result.hotspots).toEqual([]);
  });

  it('rejects preview and component traversal reported outside by the adapter', () => {
    const result = compileScreens(
      [screen('SC-AUTH-HOME', '/', 'preview: ../outside.webp\ncomponent: ../outside.tsx\n')],
      {
        assets: {
          previews: new Map([
            ['screens/SC-AUTH-HOME.md\0../outside.webp', { status: 'outside' as const }],
          ]),
          components: new Map([['../outside.tsx', 'outside' as const]]),
        },
      },
    );

    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['unsafe-screen-preview', 'unsafe-screen-component']),
    );
    expect(result.screens[0]?.preview).toBe('');
    expect(result.screens[0]?.component).toBe('../outside.tsx');
  });

  it('allows safe source-relative preview paths when the adapter has no asset inventory', () => {
    const result = compileScreens([
      screen('SC-SITE-HOME', '/', 'preview: ../assets/screens/site-home.png\n'),
    ]);

    expect(result.screens[0]?.preview).toBe('../assets/screens/site-home.png');
    expect(result.issues.some((issue) => issue.code === 'unsafe-screen-preview')).toBe(false);
  });

  it('builds explicit traceability without requiring tests for other transitions', () => {
    const home = screen(
      'SC-AUTH-HOME',
      '/',
      '',
      transitionTable(
        '| TR-AUTH-001 | UC-AUTH-01 | Open login | Always | SC-AUTH-LOGIN | | | | | navigation |\n| TR-AUTH-002 | UC-AUTH-01 | Retry login | Retry | SC-AUTH-LOGIN | | | | | navigation |',
      ),
    );
    const login = screen('SC-AUTH-LOGIN', '/login');
    const verification: ScreenCriterionVerification = {
      criterionID: 'AC-001',
      transitions: ['TR-AUTH-001'],
      references: ['pnpm test -- login'],
    };
    const workItem: ScreenWorkItemRecord = {
      id: 'TASK-AUTH-001',
      document: 'work/TASK-AUTH-001.md',
      line: 1,
      screenIDs: ['SC-AUTH-HOME'],
      transitionIDs: ['TR-AUTH-001'],
      verification: [verification],
    };
    const result = compileScreens(
      [
        document('modules/auth.md', '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth'),
        home,
        login,
        useCase(),
      ],
      { workItems: [workItem] },
    );

    expect(result.traceability).toEqual([
      {
        useCaseID: 'UC-AUTH-01',
        screenID: 'SC-AUTH-HOME',
        transitionID: 'TR-AUTH-001',
        taskID: 'TASK-AUTH-001',
        criterionID: 'AC-001',
        verification: 'pnpm test -- login',
      },
    ]);
    expect(result.issues.some((issue) => issue.code === 'transition-without-test')).toBe(false);
  });

  it('keeps state and contract semantics while rejecting a forbidden flow cycle', () => {
    const home = screen(
      'SC-AUTH-HOME',
      '/',
      '',
      transitionTable(
        '| TR-AUTH-001 | UC-AUTH-01 | Submit | Always | SC-AUTH-LOGIN | READY | AUTH_LOCKED | | [Auth](../contracts/auth.md) | navigation |',
      ),
    );
    const login = screen(
      'SC-AUTH-LOGIN',
      '/login',
      '',
      `<!-- toudocu:table states columns=id,title,preview -->
| ID | Title | Preview |
| --- | --- | --- |
| READY | Ready | |

${transitionTable('| TR-AUTH-002 | UC-AUTH-01 | Back | Always | SC-AUTH-HOME | | | | | return |')}`,
    );
    const result = compileScreens(
      [
        document('modules/auth.md', '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Auth'),
        document(
          'contracts/auth.md',
          `<!-- toudocu
id: CON-AUTH-ERRORS
status: active
-->
# Auth errors

<!-- toudocu:table errors columns=id,message -->
| ID | Message |
| --- | --- |
| AUTH_LOCKED | Account is locked. |
`,
        ),
        home,
        login,
        document(
          'use-cases/login.md',
          `<!-- toudocu
id: UC-AUTH-01
startScreen: SC-AUTH-HOME
terminalScreens: SC-AUTH-LOGIN
allowCycle: false
-->
# Login flow`,
        ),
      ],
      {
        contractLinks: new Map([
          [
            'screens/SC-AUTH-HOME.md',
            [
              {
                destination: '../contracts/auth.md',
                label: 'Auth',
                targetDocumentPath: 'contracts/auth.md',
              },
            ],
          ],
        ]),
      },
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ id: 'AUTH_LOCKED', message: 'Account is locked.' }),
    ]);
    expect(result.transitions[0]).toMatchObject({
      stateID: 'READY',
      errorID: 'AUTH_LOCKED',
      message: 'Account is locked.',
      contract: 'contracts/auth.md',
    });
    expect(result.issues.map((issue) => issue.code)).toContain('forbidden-flow-cycle');
    expect(result.playableFlows[0]?.valid).toBe(false);
  });
});
