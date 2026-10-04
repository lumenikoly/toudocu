import type { SkillPlan } from '@toudocu/core';

interface SkillResult {
  plan: SkillPlan;
  state: string;
  code?: string;
  error?: string;
}

export function formatSkillTarget(plan: SkillPlan): string {
  return `${plan.target.agent} target: ${plan.target.path}\n`;
}

export function formatSkillStatus(plan: SkillPlan): string {
  const detail = plan.before.detail === undefined ? '' : ` (${plan.before.detail})`;
  return `${plan.target.agent}: ${plan.before.state}${detail}\n`;
}

export function formatSkillResult(result: SkillResult): string {
  return `${result.plan.target.agent}: ${result.plan.before.state} -> ${result.state}\n`;
}

export function formatSkillConflict(plan: SkillPlan): string {
  return `${plan.code ?? 'SKILL_CONFLICT'}: ${plan.target.path}: ${plan.message ?? ''}\n`;
}

export function formatSkillFailure(result: SkillResult): string {
  return `${result.code ?? 'SKILL_OPERATION_FAILED'}: ${result.plan.target.path}: ${result.error ?? ''}\n`;
}
