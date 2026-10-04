import { describe, expect, test } from 'vitest';
import { buildSkillPlan, deduplicateSkillTargets } from './planner.js';

const target = {
  agent: 'codex',
  scope: 'project' as const,
  boundary: '/project',
  path: '/project/.agents/skills/toudocu',
};
const bundle = {
  id: 'toudocu',
  version: '0.0.7',
  checksum: 'bundle-checksum',
  files: [],
};

describe('skill planner', () => {
  test('plans only exact managed states for mutation', () => {
    const installed = {
      state: 'installed' as const,
      fingerprint: 'installed',
    };
    const outdated = {
      state: 'outdated' as const,
      fingerprint: 'outdated',
    };
    const modified = {
      state: 'modified' as const,
      fingerprint: 'modified',
      detail: 'local file changed',
    };

    expect(
      buildSkillPlan({ operation: 'install', target, before: installed, bundle }),
    ).toMatchObject({
      action: 'none',
      conflict: false,
    });
    expect(buildSkillPlan({ operation: 'update', target, before: outdated, bundle })).toMatchObject(
      {
        action: 'replace',
        conflict: false,
      },
    );
    expect(
      buildSkillPlan({ operation: 'install', target, before: modified, bundle }),
    ).toMatchObject({
      code: 'SKILL_LOCAL_CHANGES',
      conflict: true,
    });
  });

  test('deduplicates paths before sorting targets', () => {
    const result = deduplicateSkillTargets([
      { ...target, agent: 'copilot', path: '/project/copilot' },
      target,
      { ...target, agent: 'duplicate', path: target.path },
      { ...target, agent: 'claude-code', path: '/project/claude' },
    ]);

    expect(result.map((item) => item.agent)).toEqual(['claude-code', 'codex', 'copilot']);
  });
});
