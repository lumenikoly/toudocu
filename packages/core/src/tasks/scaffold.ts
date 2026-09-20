import { ToudocuError } from '@toudocu/contracts';

const taskAreaPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/u;
const taskIDPattern = /^(?:TASK|BUG)-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[0-9]{3,}$/u;
const entityIDPattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/u;
const taskTypes = new Set(['Feature', 'Bug', 'Maintenance', 'Documentation', 'Research']);

function invalidArgument(message: string): never {
  throw new ToudocuError('invalid_argument', message);
}

export interface ScaffoldSourceEntry {
  sourcePath: string;
  metadataID?: string;
}

export interface TaskInitInput {
  area: string;
  title: string;
  type: string;
  language: string;
  parentID?: string;
  date: string;
  entries: readonly ScaffoldSourceEntry[];
  parentExists?: boolean;
}

export interface ScaffoldInput {
  entityType: string;
  id: string;
  title: string;
  language: string;
  date: string;
}

export interface TaskInitRender {
  id: string;
  title: string;
  type: string;
  language: string;
  path: string;
  parentID: string | null;
  content: string;
}

export interface ScaffoldRender {
  entityType: string;
  id: string;
  title: string;
  language: string;
  path: string;
  content: string;
}

interface EntitySpec {
  prefix: string;
  directory: string;
}

const entitySpecs: Readonly<Record<string, EntitySpec>> = {
  module: { prefix: 'MOD-', directory: 'modules' },
  'use-case': { prefix: 'UC-', directory: 'use-cases' },
  flow: { prefix: 'FLOW-', directory: 'flows' },
  screen: { prefix: 'SC-', directory: 'screens' },
  decision: { prefix: 'ADR-', directory: 'decisions' },
  standard: { prefix: 'STD-', directory: 'quality' },
  runbook: { prefix: 'RB-', directory: 'runbooks' },
};

function assertTitle(title: string): void {
  if (!title.trim()) {
    invalidArgument('--title must not be empty');
  }
  if (title.includes('\n') || title.includes('\r')) {
    invalidArgument('--title must be one line');
  }
}

function assertLanguage(language: string): void {
  if (language !== 'en' && language !== 'ru') {
    invalidArgument('--lang must be en or ru');
  }
}

function taskNumber(entries: readonly ScaffoldSourceEntry[], prefix: string, area: string): number {
  const idPrefix = `${prefix}-${area}-`;
  let maximum = 0;
  for (const entry of entries) {
    const candidates = [
      entry.sourcePath.split('/').at(-1)?.replace(/\.md$/iu, '') ?? '',
      entry.metadataID ?? '',
    ];
    for (const candidate of candidates) {
      if (!candidate.startsWith(idPrefix)) {
        continue;
      }
      const suffix = candidate.slice(idPrefix.length);
      const digits = /^\d+/u.exec(suffix)?.[0];
      if (!digits) {
        continue;
      }
      const number = BigInt(digits);
      if (number <= BigInt(Number.MAX_SAFE_INTEGER) && number > BigInt(maximum)) {
        maximum = Number(number);
      }
    }
  }
  return maximum + 1;
}

function parentLine(parentID: string | undefined): string {
  if (!parentID) {
    return '';
  }
  return `parentTask: ${parentID}\n`;
}

function renderTask(
  id: string,
  title: string,
  type: string,
  language: string,
  date: string,
  parentID?: string,
): string {
  const parent = parentLine(parentID);
  const canonicalType = type.toLowerCase();
  if (type === 'Bug') {
    if (language === 'ru') {
      return `<!-- toudocu
id: ${id}
status: draft
taskType: bug
updated: ${date}
${parent}-->

# ${id}: ${title}

<!-- toudocu:section symptom -->
## Симптом

<!-- toudocu:section expected-behavior -->
## Ожидаемое поведение

<!-- toudocu:section actual-behavior -->
## Фактическое поведение

<!-- toudocu:section steps-to-reproduce -->
## Шаги воспроизведения

<!-- toudocu:section evidence -->
## Доказательства

<!-- toudocu:section cause -->
## Причина

Не установлена.

<!-- toudocu:section scope -->
## Область изменения

<!-- toudocu:section out-of-scope -->
## Не входит в исправление

<!-- toudocu:section plan -->
## План

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

<!-- toudocu:section verification -->
## Проверка

<!-- toudocu:section regression-test -->
## Регрессионный тест

<!-- toudocu:section documentation-impact -->
## Влияние на документацию
`;
    }
    return `<!-- toudocu
id: ${id}
status: draft
taskType: bug
updated: ${date}
${parent}-->

# ${id}: ${title}

<!-- toudocu:section symptom -->
## Symptom

<!-- toudocu:section expected-behavior -->
## Expected behavior

<!-- toudocu:section actual-behavior -->
## Actual behavior

<!-- toudocu:section steps-to-reproduce -->
## Steps to reproduce

<!-- toudocu:section evidence -->
## Evidence

<!-- toudocu:section cause -->
## Cause

Not established.

<!-- toudocu:section scope -->
## Scope

<!-- toudocu:section out-of-scope -->
## Out of scope

<!-- toudocu:section plan -->
## Plan

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

<!-- toudocu:section verification -->
## Verification

<!-- toudocu:section regression-test -->
## Regression test

<!-- toudocu:section documentation-impact -->
## Documentation impact
`;
  }
  const headings =
    language === 'ru'
      ? [
          'Результат',
          'Изменение поведения',
          'Было',
          'Станет',
          'Область изменения',
          'Не входит в задачу',
          'Критерии приёмки',
          'План',
          'Проверка',
          'Влияние на документацию',
        ]
      : [
          'Result',
          'Behavior change',
          'Before',
          'After',
          'Scope',
          'Out of scope',
          'Acceptance criteria',
          'Plan',
          'Verification',
          'Documentation impact',
        ];
  const [
    result,
    behavior,
    before,
    after,
    scope,
    outOfScope,
    acceptance,
    plan,
    verification,
    impact,
  ] = headings;
  return `<!-- toudocu
id: ${id}
status: draft
taskType: ${canonicalType}
updated: ${date}
${parent}-->

# ${id}: ${title}

<!-- toudocu:section result -->
## ${result}

<!-- toudocu:section behavior-change -->
## ${behavior}

<!-- toudocu:section before -->
### ${before}

<!-- toudocu:section after -->
### ${after}

<!-- toudocu:section scope -->
## ${scope}

<!-- toudocu:section out-of-scope -->
## ${outOfScope}

<!-- toudocu:section acceptance-criteria -->
## ${acceptance}

<!-- toudocu:section plan -->
## ${plan}

<!-- toudocu:section verification -->
## ${verification}

<!-- toudocu:section documentation-impact -->
## ${impact}
`;
}

export function renderTaskInit(input: TaskInitInput): TaskInitRender {
  if (!taskAreaPattern.test(input.area)) {
    invalidArgument('--area must contain A-Z, 0-9, and hyphens and start with a letter');
  }
  assertTitle(input.title);
  assertLanguage(input.language);
  if (!taskTypes.has(input.type)) {
    invalidArgument('--type must be Feature, Bug, Maintenance, Documentation, or Research');
  }
  if (input.parentID) {
    if (input.type === 'Bug') {
      invalidArgument('--parent is supported only for TASK-* work items');
    }
    if (!taskIDPattern.test(input.parentID) || !input.parentID.startsWith('TASK-')) {
      invalidArgument('--parent must contain exactly one TASK-* identifier');
    }
    if (input.parentExists === false) {
      invalidArgument(`parent task ${input.parentID} not found`);
    }
  }
  const prefix = input.type === 'Bug' ? 'BUG' : 'TASK';
  const number = taskNumber(input.entries, prefix, input.area);
  const id = `${prefix}-${input.area}-${String(number).padStart(3, '0')}`;
  return {
    id,
    title: input.title,
    type: input.type,
    language: input.language,
    path: `work/${id}.md`,
    parentID: input.parentID ?? null,
    content: renderTask(id, input.title, input.type, input.language, input.date, input.parentID),
  };
}

function assertEntityID(entityType: string, id: string): EntitySpec {
  const spec = entitySpecs[entityType];
  if (!spec || !id.startsWith(spec.prefix) || !entityIDPattern.test(id.slice(spec.prefix.length))) {
    invalidArgument(`invalid ${entityType} ID: ${id}`);
  }
  return spec;
}

export function renderScaffold(input: ScaffoldInput): ScaffoldRender {
  const spec = assertEntityID(input.entityType, input.id);
  assertTitle(input.title);
  assertLanguage(input.language);
  const title = input.title;
  const id = input.id;
  const date = input.date;
  let content: string;
  if (input.language === 'ru') {
    content = renderRussianEntity(input.entityType, id, title, date);
  } else {
    content = renderEnglishEntity(input.entityType, id, title, date);
  }
  return {
    entityType: input.entityType,
    id,
    title,
    language: input.language,
    path: `${spec.directory}/${id}.md`,
    content,
  };
}

function renderRussianEntity(kind: string, id: string, title: string, date: string): string {
  switch (kind) {
    case 'module':
      return `<!-- toudocu
id: ${id}
status: draft
updated: ${date}
-->

# ${id}: ${title}

## Назначение

<!-- toudocu:section business-rules -->
## Бизнес-правила

<!-- toudocu:section invariants -->
## Инварианты

<!-- toudocu:section stable-interfaces -->
## Интерфейсы
`;
    case 'use-case':
      return `<!-- toudocu
id: ${id}
status: draft
updated: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section main-scenario -->
## Основной сценарий

## Альтернативные сценарии

<!-- toudocu:section postconditions -->
## Постусловия

<!-- toudocu:section acceptance-criteria -->
## Критерии приёмки

<!-- toudocu:section business-rules -->
## Бизнес-правила
`;
    case 'flow':
      return `<!-- toudocu
id: ${id}
updated: ${date}
-->

# ${id}: ${title}

## Процесс
`;
    case 'screen':
      return `<!-- toudocu
id: ${id}
screenKind: screen
status: planned
updated: ${date}
-->

# ${id}: ${title}

## Назначение

## Состояния

## Переходы
`;
    case 'standard':
      return `<!-- toudocu
id: ${id}
status: draft
scope: TODO
updated: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section rules -->
## Правила

<!-- toudocu:section automated-checks -->
## Автоматические проверки
`;
    case 'runbook':
      return `<!-- toudocu
id: ${id}
status: draft
risk: low
lastVerified: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section prerequisites -->
## Предварительные условия

<!-- toudocu:section procedure -->
## Процедура

<!-- toudocu:section verification -->
## Проверка

<!-- toudocu:section rollback -->
## Откат
`;
    case 'decision':
      return `<!-- toudocu
id: ${id}
status: proposed
date: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section context -->
## Контекст

<!-- toudocu:section decision -->
## Решение

<!-- toudocu:section consequences -->
## Последствия
`;
    default:
      invalidArgument(`invalid scaffold type: ${kind}`);
  }
}

function renderEnglishEntity(kind: string, id: string, title: string, date: string): string {
  switch (kind) {
    case 'module':
      return `<!-- toudocu
id: ${id}
status: draft
updated: ${date}
-->

# ${id}: ${title}

## Purpose

<!-- toudocu:section business-rules -->
## Business rules

<!-- toudocu:section invariants -->
## Invariants

<!-- toudocu:section stable-interfaces -->
## Interfaces
`;
    case 'use-case':
      return `<!-- toudocu
id: ${id}
status: draft
updated: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section main-scenario -->
## Main scenario

## Alternative scenarios

<!-- toudocu:section postconditions -->
## Postconditions

<!-- toudocu:section acceptance-criteria -->
## Acceptance criteria

<!-- toudocu:section business-rules -->
## Business rules
`;
    case 'flow':
      return `<!-- toudocu
id: ${id}
updated: ${date}
-->

# ${id}: ${title}

## Process
`;
    case 'screen':
      return `<!-- toudocu
id: ${id}
screenKind: screen
status: planned
updated: ${date}
-->

# ${id}: ${title}

## Purpose

## States

## Transitions
`;
    case 'standard':
      return `<!-- toudocu
id: ${id}
status: draft
scope: TODO
updated: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section rules -->
## Rules

<!-- toudocu:section automated-checks -->
## Automated checks
`;
    case 'runbook':
      return `<!-- toudocu
id: ${id}
status: draft
risk: low
lastVerified: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section prerequisites -->
## Prerequisites

<!-- toudocu:section procedure -->
## Procedure

<!-- toudocu:section verification -->
## Verification

<!-- toudocu:section rollback -->
## Rollback
`;
    case 'decision':
      return `<!-- toudocu
id: ${id}
status: proposed
date: ${date}
-->

# ${id}: ${title}

<!-- toudocu:section context -->
## Context

<!-- toudocu:section decision -->
## Decision

<!-- toudocu:section consequences -->
## Consequences
`;
    default:
      invalidArgument(`invalid scaffold type: ${kind}`);
  }
}
