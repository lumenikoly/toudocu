import { expect, test } from 'vitest';
import { createDocument } from '../documents/document.js';
import { compileBaseKnowledge } from './entities.js';
import { compileRoadmap } from './roadmap.js';

const now = new Date('2026-09-19T00:00:00Z');
function doc(sourcePath: string, content: string) {
  return createDocument({ sourcePath, content, modifiedAt: now }, { now, staleDays: 0 });
}

test('roadmap derives completion from acceptance criteria and diagnoses stale declarations', () => {
  const useCase = doc(
    'use-cases/login.md',
    '<!-- toudocu\nid: UC-LOGIN\nmodule: MOD-AUTH\nstatus: done\n-->\n# Login\n\n<!-- toudocu:section acceptance-criteria -->\n## Acceptance\n\n- [ ] Authenticate',
  );
  const roadmap = doc(
    'roadmap.md',
    '# Roadmap\n\n<!-- toudocu:section roadmap-stage -->\n<!-- toudocu\nstatus: done\n-->\n## Delivery\n\n- [x] UC-LOGIN\n- [x] DLV-ONE\n- [ ] DLV-ONE\n- [ ] UC-MISSING\n- [ ] Missing identifier',
  );
  const result = compileRoadmap([useCase, roadmap]);
  expect(result.stages[0]?.items[0]).toMatchObject({
    id: 'UC-LOGIN',
    declaredCompleted: true,
    effectiveCompleted: false,
    completionSource: 'use-case-status',
  });
  expect(roadmap.taskStats).toEqual({ total: 5, completed: 1, remaining: 4, percent: 20 });
  expect(result.issues.map((issue) => issue.code)).toEqual(
    expect.arrayContaining([
      'duplicate-roadmap-id',
      'dangling-roadmap-reference',
      'invalid-roadmap-item-id',
      'roadmap-item-completion-mismatch',
      'roadmap-section-status-mismatch',
    ]),
  );
  expect(compileBaseKnowledge([useCase]).issues.map((issue) => issue.code)).toContain(
    'done-use-case-has-open-acceptance-criteria',
  );
});

test('entity references, risk checklists and status checklist prohibitions remain independent', () => {
  const module = doc(
    'modules/auth.md',
    '<!-- toudocu\nid: MOD-AUTH\n-->\n# Authentication\n\n## BR-AUTH-001: Account required',
  );
  const useCase = doc(
    'use-cases/login.md',
    '<!-- toudocu\nid: UC-LOGIN\nmodule: MOD-AUTH\n-->\n# Login\n\nFollow BR-AUTH-001.',
  );
  const knowledge = compileBaseKnowledge([module, useCase]);
  expect(knowledge.issues).toEqual([]);
  expect(knowledge.modules[0]?.useCaseIds).toEqual(['UC-LOGIN']);
  expect(knowledge.useCases[0]?.businessRuleIds).toEqual(['BR-AUTH-001']);
  const result = compileRoadmap([
    doc('status.md', '# Status\n\n- [ ] Requirement'),
    doc(
      'risks.md',
      '# Risks\n\n<!-- toudocu:section risk -->\n## R-1: Lost access\n\n- [x] Mitigation',
    ),
  ]);
  expect(result.issues.map((issue) => issue.code)).toEqual(['status-requirement-checklist']);
  expect(result.risks[0]).toMatchObject({
    id: 'R-1',
    title: 'Lost access',
    taskStats: { completed: 1, remaining: 0 },
  });
});
