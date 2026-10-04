import { expect, test } from 'vitest';
import { createDocument } from '../documents/document.js';
import { compileBaseKnowledge, splitReferences, useCaseReadiness } from './entities.js';

const now = new Date('2026-09-19T00:00:00Z');

function doc(sourcePath: string, content: string) {
  return createDocument({ sourcePath, content, modifiedAt: now }, { now, staleDays: 0 });
}

test('reference fields are whitespace/comma/semicolon separated and deduplicated', () => {
  expect(splitReferences('SC-2, SC-1; SC-2\nSC-10')).toEqual(['SC-2', 'SC-1', 'SC-10']);
});

test('base knowledge preserves entity links, business rules, readiness, and natural ordering', () => {
  const module = doc(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\nstatus: active\n-->\n# Authentication\n\n## BR-AUTH-10: Ten\n\n## BR-AUTH-2: Two\n',
  );
  const useCase = doc(
    'use-cases/login.md',
    '<!-- toudocu\nid: UC-LOGIN\nmodule: MOD-AUTH\nstatus: done\nscreens: SC-10, SC-2; SC-10\nstartScreen: SC-2\nterminalScreens: SC-10 SC-2\nallowCycle: true\n-->\n# Login\n\n<!-- toudocu:section acceptance-criteria -->\n## Acceptance\n\n- [x] Authenticate\n\nBR-AUTH-2\n',
  );
  const flow = doc(
    'flows/login.md',
    '<!-- toudocu\nid: FLOW-LOGIN\nmodule: MOD-AUTH\nuseCase: UC-LOGIN; UC-LOGIN\n-->\n# Login flow\n',
  );

  const result = compileBaseKnowledge([useCase, flow, module], (document) =>
    document.sourcePath === 'modules/auth.md'
      ? ['src/auth10.go', 'src/auth2.go', 'src/auth2.go']
      : document.sourcePath === 'use-cases/login.md'
        ? ['src/login.go']
        : [],
  );

  expect(result.issues).toEqual([]);
  expect(result.modules[0]).toMatchObject({
    id: 'MOD-AUTH',
    useCaseIds: ['UC-LOGIN'],
    businessRuleIds: ['BR-AUTH-2', 'BR-AUTH-10'],
    repositoryPaths: ['src/auth2.go', 'src/auth10.go'],
  });
  expect(result.useCases[0]).toMatchObject({
    id: 'UC-LOGIN',
    moduleId: 'MOD-AUTH',
    screenIds: ['SC-10', 'SC-2'],
    startScreen: 'SC-2',
    terminalScreens: ['SC-10', 'SC-2'],
    allowCycle: true,
    businessRuleIds: ['BR-AUTH-2'],
    flowIds: ['FLOW-LOGIN'],
  });
  expect(result.flows[0]).toMatchObject({
    id: 'FLOW-LOGIN',
    moduleId: 'MOD-AUTH',
    useCaseIds: ['UC-LOGIN'],
  });
  // Rule declarations retain document/heading order; module references are
  // separately natural-sorted by the legacy compiler.
  expect(result.businessRules.map((rule) => rule.id)).toEqual(['BR-AUTH-10', 'BR-AUTH-2']);
  expect(useCaseReadiness(useCase)).toMatchObject({
    statusDone: true,
    effectiveCompleted: true,
    acceptance: { found: true, total: 1, completed: 1, remaining: 0 },
  });
});

test('acceptance criteria follow Go section semantics and diagnose done use cases', () => {
  const nested = doc(
    'use-cases/nested.md',
    '<!-- toudocu\nid: UC-NESTED\nmodule: MOD-AUTH\nstatus: done\n-->\n# Nested\n\n<!-- toudocu:section acceptance-criteria -->\n### Not an H2 section\n\n- [x] Nested task\n',
  );
  const open = doc(
    'use-cases/open.md',
    '<!-- toudocu\nid: UC-OPEN\nmodule: MOD-AUTH\nstatus: done\n-->\n# Open\n\n<!-- toudocu:section acceptance-criteria -->\n## Acceptance\n\n- [ ] Open task\n',
  );

  expect(useCaseReadiness(nested)).toMatchObject({
    statusDone: true,
    effectiveCompleted: false,
    acceptance: { found: false, total: 0, completed: 0, remaining: 0 },
  });
  expect(compileBaseKnowledge([nested, open]).issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      'done-use-case-missing-acceptance-criteria',
      'done-use-case-has-open-acceptance-criteria',
    ]),
  );
});
