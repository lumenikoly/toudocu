import type { SkillOperation, SkillScope, SkillState } from '@toudocu/contracts';

export interface SkillTarget {
  agent: string;
  scope: SkillScope;
  boundary: string;
  path: string;
}

export interface SkillSnapshot {
  state: SkillState;
  fingerprint: string;
  manifest?: Record<string, unknown>;
  detail?: string;
}

export interface SkillBundleMetadata {
  id: string;
  version: string;
  checksum: string;
  files: readonly { path: string; sha256: string }[];
}

export interface SkillPlan {
  operation: SkillOperation;
  target: SkillTarget;
  before: SkillSnapshot;
  action: 'none' | 'create' | 'replace' | 'remove';
  conflict: boolean;
  code?: string;
  message?: string;
  bundle: SkillBundleMetadata;
}

export interface SkillPlanInput {
  operation: SkillOperation;
  target: SkillTarget;
  before: SkillSnapshot;
  bundle: SkillBundleMetadata;
}

export function buildSkillPlan(input: SkillPlanInput): SkillPlan {
  const plan: SkillPlan = {
    operation: input.operation,
    target: input.target,
    before: input.before,
    action: 'none',
    conflict: false,
    bundle: input.bundle,
  };
  const conflict = (code: string, message: string): SkillPlan => ({
    ...plan,
    conflict: true,
    code,
    message,
  });

  if (input.operation === 'status') {
    return plan;
  }
  if (input.operation === 'install') {
    if (input.before.state === 'not-installed') {
      return { ...plan, action: 'create' };
    }
    if (input.before.state === 'installed') {
      return plan;
    }
    if (input.before.state === 'outdated') {
      return { ...plan, action: 'replace' };
    }
    return conflictForState(conflict, input.before.state);
  }
  if (input.operation === 'update') {
    if (input.before.state === 'installed') {
      return plan;
    }
    if (input.before.state === 'outdated') {
      return { ...plan, action: 'replace' };
    }
    if (input.before.state === 'not-installed') {
      return conflict('SKILL_NOT_INSTALLED', 'run skill install first');
    }
    return conflictForState(conflict, input.before.state);
  }
  if (input.operation === 'uninstall') {
    if (input.before.state === 'installed' || input.before.state === 'outdated') {
      return { ...plan, action: 'remove' };
    }
    if (input.before.state === 'not-installed') {
      return plan;
    }
    return conflictForState(conflict, input.before.state);
  }
  return conflict(
    'SKILL_OPERATION_INVALID',
    `unsupported operation ${JSON.stringify(input.operation)}`,
  );
}

function conflictForState(
  conflict: (code: string, message: string) => SkillPlan,
  state: SkillState,
): SkillPlan {
  return conflict(codeForState(state), recommendation(state));
}

function codeForState(state: SkillState): string {
  if (state === 'modified') {
    return 'SKILL_LOCAL_CHANGES';
  }
  if (state === 'unmanaged') {
    return 'SKILL_UNMANAGED';
  }
  if (state === 'invalid-manifest') {
    return 'SKILL_MANIFEST_INVALID';
  }
  if (state === 'unsafe-path') {
    return 'SKILL_PATH_UNSAFE';
  }
  if (state === 'newer-than-bundle') {
    return 'SKILL_DOWNGRADE_BLOCKED';
  }
  return 'SKILL_CONFLICT';
}

function recommendation(state: SkillState): string {
  if (state === 'modified') {
    return 'preserve or remove local changes manually, then retry';
  }
  if (state === 'unmanaged') {
    return 'move or remove the unmanaged directory manually, then retry';
  }
  if (state === 'invalid-manifest') {
    return 'inspect the manifest and repair or remove the target manually';
  }
  if (state === 'unsafe-path') {
    return 'replace symlinks or unsafe path components manually, then retry';
  }
  if (state === 'newer-than-bundle') {
    return 'keep the newer installation or remove it manually before installing this bundle';
  }
  return 'resolve the target manually, then retry';
}

export function deduplicateSkillTargets(targets: readonly SkillTarget[]): SkillTarget[] {
  const seen = new Set<string>();
  const result: SkillTarget[] = [];
  for (const target of targets) {
    if (seen.has(target.path)) {
      continue;
    }
    seen.add(target.path);
    result.push(target);
  }
  return result.sort((left, right) => {
    if (left.agent < right.agent) {
      return -1;
    }
    if (left.agent > right.agent) {
      return 1;
    }
    return 0;
  });
}
