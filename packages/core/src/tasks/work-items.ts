import type { Issue } from '@toudocu/contracts';
import { naturalCompare } from '../documents/project.js';
import {
  parseISODate,
  statusFor,
  type Document,
  type DocumentStatus,
} from '../documents/document.js';
import type { Section, Task } from '../markdown/model.js';

export interface RepositoryInventory {
  exists(path: string): boolean;
  matches(pattern: string): readonly string[];
  documentationPath?(candidate: string, sourcePath: string): string | undefined;
}

export interface WorkItemTask {
  line: number;
  indent: number;
  completed: boolean;
  text: string;
  headingId?: string;
  headingTitle?: string;
}

export interface CriterionVerification {
  criterionId: string;
  criterion: string;
  completed: boolean;
  commands: string[];
  transitions: string[];
  verificationReferences: string[];
}

export interface VerificationCheck {
  target: string;
  commands: string[];
  line: number;
}

export interface WorkItem {
  id: string;
  title: string;
  status: DocumentStatus;
  type: string;
  archived: boolean;
  archiveYear: string;
  priority: string;
  severity: string;
  reproducibility: string;
  regression: string;
  updated: string;
  moduleId: string;
  useCaseId: string;
  flowId: string;
  screenIds: string[];
  transitionIds: string[];
  standardIds: string[];
  runbookIds: string[];
  dependsOn: string[];
  parentId: string | null;
  childIds: string[];
  document: string;
  anchor: string;
  criteria: WorkItemTask[];
  verification: CriterionVerification[];
  checks: VerificationCheck[];
  repositoryPaths: string[];
  result: string;
  behaviorChange: string;
  before: string;
  after: string;
  outOfScope: string;
  plan: string;
  documentationImpact: string;
  documentationPaths: string[];
  blocker: string;
}

export interface WorkItemCompilation {
  items: WorkItem[];
  issues: Issue[];
}

interface ParsedWorkItem {
  id: string;
  title: string;
  document: Document;
  headingLine: number;
  headingId: string;
  endLine: number;
  sections: ReadonlyMap<string, Section>;
  metadata: Record<string, string>;
}

interface WorkItemState {
  item: WorkItem;
  parsed: ParsedWorkItem;
  line: number;
  parentLine: number | undefined;
  parentCount: number;
  statusName: string;
}

const workItemId = /^(?:TASK|BUG)-[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const taskId = /^(?:TASK|BUG)-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$/u;
const criterionId = /\bAC-[A-Z0-9-]+\b/gu;
const verificationTarget = /\b(?:AC-[A-Z0-9-]+|ALL|DOCS|QUALITY)\b/gu;
const codeSpan = /`+([^`\n]+?)`+/gu;

const taskStatuses = new Set(['draft', 'ready', 'in-progress', 'blocked', 'done', 'cancelled']);
const taskTypes = new Set(['feature', 'bug', 'maintenance', 'documentation', 'research']);

function issue(
  documentPath: string,
  code: string,
  message: string,
  line?: number,
  taskIdValue?: string,
  relatedId?: string,
): Issue {
  return {
    severity: 'error',
    code,
    message,
    documentPath,
    ...(line === undefined ? {} : { line }),
    ...(taskIdValue === undefined ? {} : { taskId: taskIdValue }),
    ...(relatedId === undefined ? {} : { relatedId }),
  };
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function splitReferences(value: string | undefined): string[] {
  return unique((value ?? '').split(/[,;\s]+/u));
}

function fallbackDash(value: string | undefined): string {
  return value?.trim() ? value : '—';
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/[*_~]/gu, '')
    .trim();
}

function sortNatural(values: string[]): string[] {
  return unique(values).sort(naturalCompare);
}

function documentSections(document: Document): Section[] {
  const result: Section[] = [];
  const visit = (sections: readonly Section[]): void => {
    for (const section of sections) {
      result.push(section);
      visit(section.children);
    }
  };
  visit(document.sections);
  return result;
}

function parseWorkItems(document: Document): ParsedWorkItem[] {
  const headings = document.headings.filter((heading) => heading.level === 1);
  const sections = documentSections(document);
  const result: ParsedWorkItem[] = [];
  for (const [index, heading] of headings.entries()) {
    const next = headings[index + 1];
    const endLine = next?.range.start.line ?? document.content.split('\n').length + 1;
    const metadata = Object.assign(
      Object.create(null) as Record<string, string>,
      document.metadata,
    );
    const children = new Map<string, Section>();
    for (const section of sections) {
      if (
        section.heading.level === 2 &&
        section.heading.range.start.line > heading.range.start.line &&
        section.heading.range.start.line < endLine &&
        section.kind
      ) {
        children.set(section.kind, section);
      }
    }
    let title = heading.title.trim();
    const id = (metadata.id ?? '').trim();
    for (const separator of [':', '—']) {
      if (title.startsWith(id + separator)) title = title.slice((id + separator).length).trim();
    }
    result.push({
      id,
      title,
      document,
      headingLine: heading.range.start.line,
      headingId: heading.id,
      endLine,
      sections: children,
      metadata,
    });
  }
  return result;
}

function workSection(item: ParsedWorkItem, kind: string): Section | undefined {
  return item.sections.get(kind);
}

export function workItemSections(document: Document, id: string): ReadonlyMap<string, Section> {
  return parseWorkItems(document).find((item) => item.id === id)?.sections ?? new Map();
}

function taskFromMarkdown(task: Task): WorkItemTask {
  return {
    line: task.range.start.line,
    indent: task.indent,
    completed: task.completed,
    text: task.text,
    ...(task.headingId ? { headingId: task.headingId } : {}),
    ...(task.headingTitle ? { headingTitle: task.headingTitle } : {}),
  };
}

function commandsForVerificationLine(line: string, target: string): string[] {
  const commands: string[] = [];
  const delimiter = /→|->|=>/u.exec(line);
  const delimiterInCode =
    delimiter &&
    [...line.matchAll(codeSpan)].some(
      (match) => match.index <= delimiter.index && delimiter.index < match.index + match[0].length,
    );
  const commandText =
    delimiter && !delimiterInCode ? line.slice(delimiter.index + delimiter[0].length) : line;
  for (const match of commandText.matchAll(codeSpan)) {
    const value = match[1]?.trim() ?? '';
    if (value && value !== target) commands.push(value);
  }
  if (commands.length) return unique(commands);
  for (const delimiter of ['→', '->', '=>']) {
    const index = line.indexOf(delimiter);
    if (index >= 0) {
      const value = stripInlineMarkdown(line.slice(index + delimiter.length));
      if (value) return [value];
    }
  }
  return [];
}

function targetsForVerificationLine(line: string): string[] {
  let text = stripInlineMarkdown(line).toUpperCase();
  let delimiterIndex = -1;
  for (const delimiter of ['→', '->', '=>']) {
    const index = text.indexOf(delimiter);
    if (index >= 0 && (delimiterIndex < 0 || index < delimiterIndex)) delimiterIndex = index;
  }
  if (delimiterIndex >= 0) text = text.slice(0, delimiterIndex);
  else {
    text = text.replace(/^[-*+ ]+/u, '').trim();
    text = text.split(/\s+/u)[0] ?? '';
  }
  return unique([...text.matchAll(verificationTarget)].map((match) => match[0] ?? ''));
}

function traceabilityForVerificationLine(
  line: string,
  id: string,
): { transitions: string[]; reference: string } | undefined {
  const parts = stripInlineMarkdown(line)
    .replace(/^[-*+ ]+/u, '')
    .split(/\s*(?:→|->|=>)\s*/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 3 || !targetsForVerificationLine(line).includes(id)) return undefined;
  const transitions = splitReferences(parts[1])
    .filter((value) => value.toUpperCase().startsWith('TR-'))
    .map((value) => value.toUpperCase());
  if (!transitions.length) return undefined;
  return { transitions: unique(transitions), reference: parts.slice(2).join(' → ').trim() };
}

function parseCriteriaAndVerification(
  item: ParsedWorkItem,
  required: boolean,
  issues: Issue[],
): {
  criteria: WorkItemTask[];
  verification: CriterionVerification[];
  checks: VerificationCheck[];
} {
  const criteriaSection = workSection(item, 'acceptance-criteria');
  if (!criteriaSection) return { criteria: [], verification: [], checks: [] };
  if (required && criteriaSection.tasks.length === 0) {
    issues.push(
      issue(
        item.document.sourcePath,
        'missing-acceptance-criterion',
        'The task must contain at least one acceptance criterion.',
        criteriaSection.heading.range.start.line,
      ),
    );
  }
  const criterionData: { task: Task; id: string }[] = [];
  const byId = new Map<string, { task: Task; id: string }>();
  for (const task of criteriaSection.tasks) {
    const ids = [...task.text.toUpperCase().matchAll(criterionId)].map((match) => match[0] ?? '');
    if (
      ids.length !== 1 ||
      !task.text
        .trimStart()
        .toUpperCase()
        .startsWith(ids[0] ?? '')
    ) {
      issues.push(
        issue(
          item.document.sourcePath,
          'invalid-acceptance-criterion-id',
          'Every acceptance criterion must start with a unique AC-* identifier.',
          task.range.start.line,
        ),
      );
      continue;
    }
    const id = ids[0];
    if (!id) continue;
    if (byId.has(id)) {
      issues.push(
        issue(
          item.document.sourcePath,
          'duplicate-acceptance-criterion-id',
          `Criterion identifier ${id} is duplicated within the task.`,
          task.range.start.line,
        ),
      );
      continue;
    }
    const data = { task, id };
    criterionData.push(data);
    byId.set(id, data);
  }

  const checks: VerificationCheck[] = [];
  const commandsById = new Map<string, string[]>();
  const transitionsById = new Map<string, string[]>();
  const referencesById = new Map<string, string[]>();
  const verificationSection = workSection(item, 'verification');
  if (verificationSection) {
    for (const [localIndex, line] of verificationSection.markdown.split('\n').entries()) {
      const issueLine = verificationSection.heading.range.start.line + 1 + localIndex;
      const targets = targetsForVerificationLine(line);
      if (!targets.length) continue;
      for (const target of targets) {
        if (target.startsWith('AC-') && !byId.has(target)) {
          issues.push(
            issue(
              item.document.sourcePath,
              'unknown-criterion-verification',
              `Verification references unknown criterion ${target}.`,
              issueLine,
            ),
          );
          continue;
        }
        if (target.startsWith('AC-')) {
          const trace = traceabilityForVerificationLine(line, target);
          if (trace) {
            const references = referencesById.get(target) ?? [];
            transitionsById.set(target, [
              ...(transitionsById.get(target) ?? []),
              ...trace.transitions,
            ]);
            if (!trace.reference) {
              issues.push(
                issue(
                  item.document.sourcePath,
                  'empty-traceability-verification',
                  `No verification is defined for the relationship between ${target} and the transition.`,
                  issueLine,
                ),
              );
            } else {
              referencesById.set(target, [...references, trace.reference]);
            }
            continue;
          }
        }
        const commands = commandsForVerificationLine(line, target);
        if (!commands.length) {
          issues.push(
            issue(
              item.document.sourcePath,
              'empty-criterion-verification',
              `No verification command is defined for target ${target}.`,
              issueLine,
            ),
          );
          continue;
        }
        checks.push({ target, commands, line: issueLine });
        if (target.startsWith('AC-'))
          commandsById.set(target, [...(commandsById.get(target) ?? []), ...commands]);
      }
    }
  }
  const criteria: WorkItemTask[] = [];
  const verification: CriterionVerification[] = [];
  for (const criterion of criterionData) {
    const commands = unique(commandsById.get(criterion.id) ?? []);
    if (required && !commands.length) {
      issues.push(
        issue(
          item.document.sourcePath,
          'missing-criterion-verification',
          `Criterion ${criterion.id} has no command in the Verification section.`,
          criterion.task.range.start.line,
        ),
      );
    }
    criteria.push(taskFromMarkdown(criterion.task));
    verification.push({
      criterionId: criterion.id,
      criterion: criterionIdReplace(criterion.task.text),
      completed: criterion.task.completed,
      commands,
      transitions: unique(transitionsById.get(criterion.id) ?? []),
      verificationReferences: unique(referencesById.get(criterion.id) ?? []),
    });
  }
  return { criteria, verification, checks };
}

function criterionIdReplace(value: string): string {
  return value.replace(criterionId, '').trim();
}

function requiredSection(
  item: ParsedWorkItem,
  kind: string,
  label: string,
  issues: Issue[],
): Section | undefined {
  const section = workSection(item, kind);
  if (!section) {
    issues.push(
      issue(
        item.document.sourcePath,
        'missing-work-section',
        `Task ${item.id} has no ${label} section.`,
        item.headingLine,
      ),
    );
  } else if (!section.text.trim()) {
    issues.push(
      issue(
        item.document.sourcePath,
        'empty-work-section',
        `Section ${label} in task ${item.id} must not be empty.`,
        section.heading.range.start.line,
      ),
    );
  }
  return section;
}

function nestedSectionText(section: Section | undefined, kind: string): string {
  return section?.children.find((child) => child.kind === kind)?.text.trim() ?? '';
}

function validateBugMetadata(item: ParsedWorkItem, issues: Issue[]): void {
  const fields: [string, string][] = [
    ['severity', 'Severity'],
    ['priority', 'Priority'],
    ['reproducibility', 'Reproducibility'],
    ['regression', 'Regression'],
    ['module', 'Module'],
    ['useCase', 'Use case'],
    ['updated', 'Updated'],
  ];
  for (const [key, label] of fields)
    if (!item.metadata[key]?.trim())
      issues.push(
        issue(
          item.document.sourcePath,
          'missing-bug-field',
          `A bug requires the ${label} field.`,
          item.headingLine,
        ),
      );
  if (
    item.metadata.severity &&
    !new Set(['critical', 'high', 'medium', 'low']).has(item.metadata.severity)
  )
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-severity',
        'Bug severity must be Critical, High, Medium, or Low.',
        item.headingLine,
      ),
    );
  if (
    item.metadata.priority &&
    !new Set(['urgent', 'high', 'normal', 'low']).has(item.metadata.priority)
  )
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-priority',
        'Bug priority must be Urgent, High, Normal, or Low.',
        item.headingLine,
      ),
    );
  if (
    item.metadata.reproducibility &&
    !new Set(['always', 'often', 'sometimes', 'rarely', 'not-reproduced', 'unknown']).has(
      item.metadata.reproducibility,
    )
  )
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-reproducibility',
        'Invalid bug reproducibility value.',
        item.headingLine,
      ),
    );
  if (item.metadata.regression && !['true', 'false'].includes(item.metadata.regression.trim()))
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-regression',
        'The Regression field must be true or false.',
        item.headingLine,
      ),
    );
  if (item.metadata.updated && !parseISODate(item.metadata.updated.trim()))
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-updated-date',
        'The Updated field must contain a YYYY-MM-DD date.',
        item.headingLine,
      ),
    );
  if (item.metadata.regression?.trim() === 'true' && !item.metadata.observedIn?.trim())
    issues.push(
      issue(
        item.document.sourcePath,
        'missing-regression-version',
        'A regression requires the version or period in which the defect was observed.',
        item.headingLine,
      ),
    );
}

function safeScopePath(value: string): boolean {
  const normalized = value.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) return false;
  let depth = 0;
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (depth === 0) return false;
      depth--;
    } else depth++;
  }
  return true;
}

function validateScopePaths(
  item: ParsedWorkItem,
  repository: RepositoryInventory,
  terminal: boolean,
  issues: Issue[],
): string[] {
  const section = workSection(item, 'scope');
  if (!section) return [];
  const result: string[] = [];
  for (const match of section.markdown.matchAll(codeSpan)) {
    const value = (match[1] ?? '').trim().replaceAll('\\', '/');
    if (!value || /[\n\r]/u.test(value)) continue;
    const normalized = value.replaceAll('\\', '/');
    if (normalized.startsWith('/') || /^[A-Za-z]:\//u.test(normalized)) {
      issues.push(
        issue(
          item.document.sourcePath,
          'unsafe-scope-path',
          `Scope path must be relative to the repository root: ${value}.`,
          section.heading.range.start.line,
        ),
      );
      continue;
    }
    if (!safeScopePath(value)) {
      issues.push(
        issue(
          item.document.sourcePath,
          'unsafe-scope-path',
          `Scope path escapes the repository root: ${value}.`,
          section.heading.range.start.line,
        ),
      );
      continue;
    }
    const wildcard = /[*?[\]]/u.test(value);
    if (wildcard) {
      const matches = repository.matches(value);
      if (!matches.length && !terminal) {
        issues.push(
          issue(
            item.document.sourcePath,
            'missing-scope-path',
            `Scope path does not exist: ${value}.`,
            section.heading.range.start.line,
          ),
        );
        continue;
      }
      if (matches.some((match) => !safeScopePath(match))) {
        issues.push(
          issue(
            item.document.sourcePath,
            'unsafe-scope-path',
            `Scope match escapes the repository root: ${value}.`,
            section.heading.range.start.line,
          ),
        );
        continue;
      }
    } else if (!repository.exists(value)) {
      if (terminal) {
        result.push(value);
        continue;
      }
      if (value.endsWith('/')) {
        issues.push(
          issue(
            item.document.sourcePath,
            'missing-scope-path',
            `A new missing scope path must be a file, not a directory: ${value}.`,
            section.heading.range.start.line,
          ),
        );
        continue;
      }
      const slash = value.lastIndexOf('/');
      const parent = slash < 0 ? '.' : value.slice(0, slash) || '.';
      if (!repository.exists(parent)) {
        issues.push(
          issue(
            item.document.sourcePath,
            'missing-scope-path',
            `The parent directory of the new scope file does not exist: ${value}.`,
            section.heading.range.start.line,
          ),
        );
        continue;
      }
    }
    result.push(value);
  }
  return sortNatural(result);
}

function documentationPaths(item: ParsedWorkItem, repository: RepositoryInventory): string[] {
  const section = workSection(item, 'documentation-impact');
  if (!section) return [];
  const candidates: string[] = [];
  for (const match of section.markdown.matchAll(codeSpan)) candidates.push(match[1]?.trim() ?? '');
  for (const link of item.document.links) {
    if (
      link.image ||
      link.range.start.line <= section.heading.range.start.line ||
      link.range.start.line > section.range.end.line
    )
      continue;
    candidates.push((link.destination.split('#')[0] ?? '').trim());
  }
  const result: string[] = [];
  for (const candidate of candidates) {
    const value = candidate.replaceAll('\\', '/');
    if (repository.documentationPath) {
      const path = repository.documentationPath(value, item.document.sourcePath);
      if (path) result.push(path);
      continue;
    }
    if (!value || /[*?[\]]/u.test(value) || value.includes('://') || !safeScopePath(value))
      continue;
    if (repository.exists(value)) result.push(value);
  }
  return sortNatural(result);
}

function archiveInfo(sourcePath: string): { archived: boolean; year: string; valid: boolean } {
  const normalized = sourcePath.replaceAll('\\', '/').replace(/^\.\//u, '');
  const parts = normalized.split('/');
  if (parts.length < 2 || parts[0] !== 'work' || parts[1] !== 'archive')
    return { archived: false, year: '', valid: true };
  const valid =
    parts.length === 4 &&
    /^\d{4}$/u.test(parts[2] ?? '') &&
    parts[3]?.toLowerCase().endsWith('.md') === true;
  return { archived: true, year: valid ? (parts[2] ?? '') : '', valid };
}

function validateWorkItem(
  item: ParsedWorkItem,
  repository: RepositoryInventory,
  issues: Issue[],
): WorkItemState {
  const statusName = item.metadata.status?.trim() ?? '';
  const type = item.metadata.taskType?.trim() ?? '';
  const statusValid = taskStatuses.has(statusName);
  const typeValid = taskTypes.has(type);
  if (!statusValid)
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-task-status',
        `Invalid task status: ${fallbackDash(item.metadata.status)}.`,
        item.headingLine,
      ),
    );
  if (!typeValid)
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-task-type',
        'Task type must be Feature, Bug, Maintenance, Documentation, or Research.',
        item.headingLine,
      ),
    );
  if (!workItemId.test(item.id))
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-work-item-id',
        'A work item requires a canonical TASK-* or BUG-* id.',
        item.headingLine,
      ),
    );
  const isBug = typeValid && type === 'bug';
  if (isBug && !item.id.startsWith('BUG-'))
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-bug-id',
        'A Bug work item identifier must start with BUG-.',
        item.headingLine,
      ),
    );
  if (!isBug && item.id.startsWith('BUG-'))
    issues.push(
      issue(
        item.document.sourcePath,
        'bug-id-type-mismatch',
        'A BUG-* identifier requires `taskType: bug`.',
        item.headingLine,
      ),
    );
  if (isBug) validateBugMetadata(item, issues);

  const strict = statusValid && statusName !== 'draft';
  const required: [string, string][] = isBug
    ? [
        ['symptom', 'Symptom'],
        ['expected-behavior', 'Expected behavior'],
        ['actual-behavior', 'Actual behavior'],
      ]
    : [['result', 'Result']];
  if (strict) {
    required.push(
      ['scope', 'Scope'],
      ['out-of-scope', 'Out of scope'],
      ['acceptance-criteria', 'Acceptance criteria'],
      ['plan', 'Plan'],
      ['verification', 'Verification'],
      ['documentation-impact', 'Documentation impact'],
    );
    if (isBug) required.push(['cause', 'Root cause']);
    else if (type === 'feature') required.push(['behavior-change', 'Behavior change']);
  }
  const requiredSections = new Map<string, Section | undefined>();
  for (const [kind, label] of required)
    requiredSections.set(kind, requiredSection(item, kind, label, issues));
  const parsed = parseCriteriaAndVerification(item, strict, issues);
  if (strict && type === 'feature') {
    const behavior = requiredSections.get('behavior-change');
    if (
      behavior &&
      (!nestedSectionText(behavior, 'before') || !nestedSectionText(behavior, 'after'))
    )
      issues.push(
        issue(
          item.document.sourcePath,
          'incomplete-behavior-change',
          'The Behavior change section must contain non-empty Before and After subsections.',
          behavior.heading.range.start.line,
        ),
      );
  }
  const allowedChecklistLines = new Set<number>();
  const criteriaSection = workSection(item, 'acceptance-criteria');
  for (const task of criteriaSection?.tasks ?? []) allowedChecklistLines.add(task.range.start.line);
  const planSection = workSection(item, 'plan');
  for (const task of planSection?.tasks ?? []) {
    if (isBug)
      issues.push(
        issue(
          item.document.sourcePath,
          'bug-plan-checkbox',
          'A bug plan must be a numbered list without checkboxes.',
          task.range.start.line,
        ),
      );
    allowedChecklistLines.add(task.range.start.line);
  }
  for (const task of item.document.tasks) {
    if (
      task.range.start.line <= item.headingLine ||
      task.range.start.line > item.endLine ||
      allowedChecklistLines.has(task.range.start.line)
    )
      continue;
    const message = isBug
      ? 'In a bug document, checkboxes are allowed only in the Acceptance criteria section.'
      : 'Task checkboxes are allowed only in the Acceptance criteria and Plan sections.';
    issues.push(
      issue(
        item.document.sourcePath,
        'task-checkbox-outside-criteria',
        message,
        task.range.start.line,
      ),
    );
  }
  if (isBug) {
    const steps = workSection(item, 'steps-to-reproduce');
    const evidence = workSection(item, 'evidence');
    if ((!steps || !steps.text.trim()) && (!evidence || !evidence.text.trim()))
      issues.push(
        issue(
          item.document.sourcePath,
          'missing-bug-reproduction-evidence',
          'A bug must contain reproduction steps or non-empty evidence.',
          item.headingLine,
        ),
      );
    if (statusName === 'done' && !workSection(item, 'cause')?.text.trim())
      issues.push(
        issue(
          item.document.sourcePath,
          'missing-completed-bug-cause',
          'A completed bug must have an established root cause.',
          item.headingLine,
        ),
      );
  }
  if (statusName === 'blocked') requiredSection(item, 'blocker', 'Blocker', issues);
  if (statusName === 'cancelled')
    requiredSection(item, 'cancellation-reason', 'Cancellation reason', issues);
  let terminalHistory = statusName === 'cancelled';
  if (statusName === 'done') {
    terminalHistory = true;
    if (criteriaSection) {
      for (const criterion of criteriaSection.tasks)
        if (!criterion.completed) {
          terminalHistory = false;
          issues.push(
            issue(
              item.document.sourcePath,
              'incomplete-completed-task',
              'Every acceptance criterion in a completed task must be marked [x].',
              criterion.range.start.line,
            ),
          );
        }
    } else terminalHistory = false;
  }
  let useCaseId = item.metadata.useCase?.trim() ?? '';
  const useCaseOmitted = isBug && useCaseId === 'not-applicable';
  if (useCaseOmitted) {
    useCaseId = '';
    if (!workSection(item, 'relationship-to-user-behavior')?.text.trim())
      issues.push(
        issue(
          item.document.sourcePath,
          'missing-bug-use-case-explanation',
          'A not-applicable Use case value requires a Relationship to user behavior section.',
          item.headingLine,
        ),
      );
  }
  if (
    strict &&
    typeValid &&
    (type === 'feature' || type === 'bug') &&
    !useCaseId &&
    !useCaseOmitted
  )
    issues.push(
      issue(
        item.document.sourcePath,
        'missing-task-use-case',
        `A ${type} task requires a linked use case.`,
        item.headingLine,
      ),
    );
  if (
    strict &&
    typeValid &&
    type !== 'feature' &&
    type !== 'bug' &&
    !useCaseId &&
    !workSection(item, 'use-case-omission-reason')?.text.trim()
  )
    issues.push(
      issue(
        item.document.sourcePath,
        'missing-use-case-omission-reason',
        'A technical task without a use case must contain a Use case omission reason section.',
        item.headingLine,
      ),
    );

  const archive = archiveInfo(item.document.sourcePath);
  if (archive.archived && !archive.valid)
    issues.push(
      issue(
        item.document.sourcePath,
        'invalid-task-archive-path',
        'An archived task must be stored under work/archive/YYYY/*.md.',
        item.headingLine,
      ),
    );
  if (archive.archived && statusName !== 'done' && statusName !== 'cancelled')
    issues.push(
      issue(
        item.document.sourcePath,
        'nonterminal-archived-task',
        'Only Done and Cancelled tasks may be archived.',
        item.headingLine,
      ),
    );
  const parentValues = item.metadata.parentTask ?? '';
  const parentId = parentValues.trim() || null;
  const workItem: WorkItem = {
    id: item.id,
    title: item.title,
    status: statusFor(statusName),
    type,
    archived: archive.archived,
    archiveYear: archive.year,
    priority: item.metadata.priority ?? '',
    severity: item.metadata.severity ?? '',
    reproducibility: item.metadata.reproducibility ?? '',
    regression: item.metadata.regression ?? '',
    updated: item.metadata.updated ?? '',
    moduleId: item.metadata.module ?? '',
    useCaseId,
    flowId: item.metadata.flow?.trim() ?? '',
    screenIds: splitReferences(item.metadata.screens),
    transitionIds: splitReferences(item.metadata.transitions),
    standardIds: splitReferences(item.metadata.standards),
    runbookIds: splitReferences(item.metadata.runbooks),
    dependsOn: splitReferences(item.metadata.dependsOn),
    parentId,
    childIds: [],
    document: item.document.sourcePath,
    anchor: item.headingId,
    criteria: parsed.criteria,
    verification: parsed.verification,
    checks: parsed.checks,
    repositoryPaths: validateScopePaths(item, repository, terminalHistory, issues),
    result: workSection(item, 'result')?.text.trim() ?? '',
    behaviorChange: workSection(item, 'behavior-change')?.text.trim() ?? '',
    before: nestedSectionText(workSection(item, 'behavior-change'), 'before'),
    after: nestedSectionText(workSection(item, 'behavior-change'), 'after'),
    outOfScope: workSection(item, 'out-of-scope')?.text.trim() ?? '',
    plan: workSection(item, 'plan')?.text.trim() ?? '',
    documentationImpact: workSection(item, 'documentation-impact')?.text.trim() ?? '',
    documentationPaths: documentationPaths(item, repository),
    blocker: workSection(item, 'blocker')?.text.trim() ?? '',
  };
  return {
    item: workItem,
    parsed: item,
    line: item.headingLine,
    parentLine: metadataLine(item.document, 'parentTask'),
    parentCount: metadataCount(item.document, 'parentTask'),
    statusName,
  };
}

function metadataLine(document: Document, key: string): number | undefined {
  return document.metadataItems.find((item) => item.key === key)?.range.start.line;
}

function metadataCount(document: Document, key: string): number {
  return document.metadataItems.filter((item) => item.key === key).length;
}

function sortedStates(states: readonly WorkItemState[]): WorkItemState[] {
  return [...states].sort((a, b) => naturalCompare(a.item.id, b.item.id));
}

function hierarchy(
  states: WorkItemState[],
  byId: ReadonlyMap<string, WorkItemState>,
  issues: Issue[],
): void {
  for (const state of sortedStates(states)) {
    const parentId = state.item.parentId ?? '';
    if (!parentId) continue;
    const line = state.parentLine ?? state.line;
    if (state.parentCount > 1) {
      issues.push(
        issue(
          state.item.document,
          'TASK_PARENT_INVALID',
          `Task ${state.item.id} declares Parent more than once; exactly one TASK-* identifier is allowed.`,
          line,
          state.item.id,
          parentId,
        ),
      );
      continue;
    }
    if (!taskId.test(parentId)) {
      issues.push(
        issue(
          state.item.document,
          'TASK_PARENT_INVALID',
          `Task ${state.item.id} has invalid Parent value ${parentId}; exactly one TASK-* identifier is required.`,
          line,
          state.item.id,
          parentId,
        ),
      );
      continue;
    }
    if (state.item.id === parentId) {
      issues.push(
        issue(
          state.item.document,
          'TASK_PARENT_SELF',
          `Task ${state.item.id} cannot be its own parent.`,
          line,
          state.item.id,
          parentId,
        ),
      );
      continue;
    }
    const parent = byId.get(parentId);
    if (!parent) {
      issues.push(
        issue(
          state.item.document,
          'TASK_PARENT_UNKNOWN',
          `Task ${state.item.id} references unknown parent ${parentId}.`,
          line,
          state.item.id,
          parentId,
        ),
      );
      continue;
    }
    if (!state.item.id.startsWith('TASK-') || !parent.item.id.startsWith('TASK-')) {
      issues.push(
        issue(
          state.item.document,
          'TASK_PARENT_TYPE_UNSUPPORTED',
          `Parent relation ${state.item.id} → ${parentId} is supported only between TASK-* work items.`,
          line,
          state.item.id,
          parentId,
        ),
      );
      continue;
    }
    parent.item.childIds.push(state.item.id);
  }
  for (const state of sortedStates(states)) state.item.childIds.sort(naturalCompare);
  const state = new Map<string, number>();
  const stack: string[] = [];
  const visit = (item: WorkItemState): void => {
    if (state.get(item.item.id) === 2) return;
    if (state.get(item.item.id) === 1) {
      const start = stack.indexOf(item.item.id);
      const cycle = [...stack.slice(start), item.item.id];
      const message = `Task hierarchy cycle: ${cycle.join(' → ')}.`;
      for (const id of cycle.slice(0, -1)) {
        const member = byId.get(id);
        if (member)
          issues.push(
            issue(
              member.item.document,
              'TASK_PARENT_CYCLE',
              message,
              member.parentLine,
              member.item.id,
              member.item.parentId ?? '',
            ),
          );
      }
      return;
    }
    state.set(item.item.id, 1);
    stack.push(item.item.id);
    const parent = byId.get(item.item.parentId ?? '');
    if (parent) visit(parent);
    stack.pop();
    state.set(item.item.id, 2);
  };
  for (const item of sortedStates(states)) visit(item);
  for (const state of sortedStates(states)) {
    if (state.statusName === 'done')
      for (const childId of state.item.childIds) {
        const child = byId.get(childId);
        if (child && child.statusName !== 'done')
          issues.push(
            issue(
              state.item.document,
              'TASK_CHILD_INCOMPLETE',
              `Done task ${state.item.id} has incomplete child ${child.item.id} (${child.item.status.label}).`,
              state.line,
              state.item.id,
              child.item.id,
            ),
          );
      }
    if (state.statusName === 'cancelled')
      for (const childId of state.item.childIds) {
        const child = byId.get(childId);
        if (child && child.statusName !== 'done' && child.statusName !== 'cancelled')
          issues.push(
            issue(
              state.item.document,
              'TASK_CANCELLED_PARENT_ACTIVE_CHILD',
              `Cancelled task ${state.item.id} has active child ${child.item.id} (${child.item.status.label}).`,
              state.line,
              state.item.id,
              child.item.id,
            ),
          );
      }
  }
}

function dependencyCycles(
  states: WorkItemState[],
  byId: ReadonlyMap<string, WorkItemState>,
  issues: Issue[],
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (state: WorkItemState, stack: string[]): void => {
    if (visited.has(state.item.id)) return;
    if (visiting.has(state.item.id)) {
      const start = stack.indexOf(state.item.id);
      const cycle = [...stack.slice(start), state.item.id];
      issues.push(
        issue(
          state.item.document,
          'task-dependency-cycle',
          `Task dependency cycle: ${cycle.join(' → ')}.`,
          state.line,
        ),
      );
      return;
    }
    visiting.add(state.item.id);
    for (const id of state.item.dependsOn) {
      const dependency = byId.get(id);
      if (dependency) visit(dependency, [...stack, state.item.id]);
    }
    visiting.delete(state.item.id);
    visited.add(state.item.id);
  };
  for (const state of states) visit(state, []);
}

function completionCycles(
  states: WorkItemState[],
  byId: ReadonlyMap<string, WorkItemState>,
  issues: Issue[],
): void {
  const state = new Map<string, number>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const visit = (item: WorkItemState): void => {
    if (state.get(item.item.id) === 2) return;
    if (state.get(item.item.id) === 1) {
      const start = stack.indexOf(item.item.id);
      const cycle = [...stack.slice(start), item.item.id];
      const key = cycle.join('|');
      if (!reported.has(key)) {
        reported.add(key);
        const message = `Task completion cycle: ${cycle.join(' → ')}.`;
        for (const [index, id] of cycle.slice(0, -1).entries()) {
          const member = byId.get(id);
          if (member)
            issues.push(
              issue(
                member.item.document,
                'TASK_COMPLETION_CYCLE',
                message,
                member.line,
                member.item.id,
                cycle[index + 1],
              ),
            );
        }
      }
      return;
    }
    state.set(item.item.id, 1);
    stack.push(item.item.id);
    const edges = sortNatural([...item.item.dependsOn, ...item.item.childIds]);
    for (const id of edges) {
      const next = byId.get(id);
      if (next) visit(next);
    }
    stack.pop();
    state.set(item.item.id, 2);
  };
  for (const item of sortedStates(states)) visit(item);
}

/** Compile all work documents into validated work items and an isolated issue list. */
export function compileWorkItems(
  documents: readonly Document[],
  repository: RepositoryInventory,
): WorkItemCompilation {
  const issues: Issue[] = [];
  const states: WorkItemState[] = [];
  for (const document of documents) {
    if (document.type !== 'work') continue;
    const parsed = parseWorkItems(document);
    if (parsed.length !== 1)
      issues.push(
        issue(
          document.sourcePath,
          'work-item-count',
          `A work document must contain exactly one TASK-* or BUG-* work item; found ${parsed.length}.`,
        ),
      );
    for (const item of parsed) states.push(validateWorkItem(item, repository, issues));
  }
  const byId = new Map<string, WorkItemState>();
  for (const state of states) if (!byId.has(state.item.id)) byId.set(state.item.id, state);
  for (const state of states) {
    for (const dependency of state.item.dependsOn) {
      if (!byId.has(dependency))
        issues.push(
          issue(
            state.item.document,
            'dangling-task-reference',
            `Task ${state.item.id} depends on unknown task ${dependency}.`,
            state.line,
          ),
        );
      if (state.statusName === 'done') {
        const target = byId.get(dependency);
        if (target && target.statusName !== 'done')
          issues.push(
            issue(
              state.item.document,
              'incomplete-task-dependency',
              `Completed task ${state.item.id} depends on incomplete task ${dependency}.`,
              state.line,
            ),
          );
      }
    }
  }
  hierarchy(states, byId, issues);
  dependencyCycles(states, byId, issues);
  completionCycles(states, byId, issues);
  return { items: states.map((state) => state.item), issues };
}
