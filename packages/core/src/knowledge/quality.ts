import type { Issue } from '@toudocu/contracts';
import {
  parseISODate,
  statusFor,
  type Document,
  type DocumentOptions,
  type DocumentStatus,
} from '../documents/document.js';
import type { ResolvedLink } from '../documents/links.js';
import { naturalCompare } from '../documents/project.js';
import { sectionByKind, sectionText } from './entities.js';

export interface KnowledgeStandard {
  id: string;
  title: string;
  status: DocumentStatus;
  scope: string;
  updated: string;
  supersededBy: string;
  rules: string;
  automaticChecks: string;
  document: string;
}
export interface KnowledgeRunbook {
  id: string;
  title: string;
  status: DocumentStatus;
  environment: string;
  risk: string;
  lastVerified: string;
  freshness: string;
  document: string;
}
export function compileQuality(
  documents: readonly Document[],
  options: DocumentOptions,
  links: ReadonlyMap<string, readonly ResolvedLink[]> = new Map(),
) {
  const standards: KnowledgeStandard[] = [],
    runbooks: KnowledgeRunbook[] = [],
    issues: Issue[] = [];
  const standardIds = new Map<string, Document>(),
    runbookIds = new Map<string, Document>();
  const report = (
    document: Document,
    code: string,
    message: string,
    severity: Issue['severity'] = 'warning',
  ): void => {
    issues.push({ severity, code, message, documentPath: document.sourcePath });
  };
  for (const document of documents) {
    const meta = (key: string): string => document.metadata[key]?.trim() ?? '';
    const id = meta('id'),
      status = meta('status');
    if (document.type !== 'standard' && document.type !== 'runbook') continue;
    const standard = document.type === 'standard',
      label = standard ? 'Standard' : 'Runbook',
      type = document.type;
    const ids = standard ? standardIds : runbookIds;
    if (!(standard ? /^STD-[A-Z0-9]+(?:-[A-Z0-9]+)*$/ : /^RB-[A-Z0-9]+(?:-[A-Z0-9]+)*$/).test(id))
      report(
        document,
        `invalid-${type}-id`,
        `A ${type} must have an ${standard ? 'STD' : 'RB'}-* identifier.`,
        'error',
      );
    else if (ids.has(id))
      report(
        document,
        `duplicate-${type}-id`,
        `${label} ${id} is already declared in ${ids.get(id)?.sourcePath}.`,
        'error',
      );
    else ids.set(id, document);
    if (standard) {
      const scope = meta('scope'),
        updated = meta('updated'),
        supersededBy = meta('supersededBy');
      const rules = sectionText(document, 'rules'),
        automaticChecks = sectionText(document, 'automated-checks');
      if (!scope) report(document, 'missing-standard-scope', 'The standard has no scope.');
      if (!['draft', 'active', 'obsolete', 'superseded'].includes(status))
        report(
          document,
          'invalid-standard-status',
          'The standard status is missing or unrecognized.',
        );
      if (!parseISODate(updated))
        report(
          document,
          'invalid-standard-updated',
          'The standard update date is missing or is not a valid ISO date.',
        );
      if (!rules)
        report(document, 'missing-standard-rules', 'The Rules section must not be empty.');
      if (!automaticChecks)
        report(
          document,
          'missing-standard-automatic-checks',
          'The Automated checks section must not be empty.',
        );
      if (status === 'superseded' && !/^STD-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(supersededBy))
        report(
          document,
          'missing-standard-superseded-by',
          'A superseded standard must reference an STD-* identifier in its Superseded by field.',
          'error',
        );
      standards.push({
        id,
        title: document.title,
        status: statusFor(status),
        scope,
        updated,
        supersededBy,
        rules,
        automaticChecks,
        document: document.sourcePath,
      });
      continue;
    }
    const environment = meta('environment'),
      risk = meta('risk'),
      lastVerified = meta('lastVerified'),
      date = parseISODate(lastVerified);
    if (!environment)
      report(document, 'missing-runbook-environment', 'The runbook has no environment.');
    if (!['draft', 'active', 'review-required', 'obsolete'].includes(status))
      report(document, 'invalid-runbook-status', 'The runbook status is missing or unrecognized.');
    if (!['low', 'medium', 'high', 'critical'].includes(risk))
      report(document, 'invalid-runbook-risk', 'The runbook risk is missing or unrecognized.');
    for (const [kind, title] of [
      ['prerequisites', 'Prerequisites'],
      ['procedure', 'Procedure'],
      ['verification', 'Verification'],
      ['rollback', 'Rollback'],
    ] as const) {
      if (!sectionText(document, kind))
        report(
          document,
          'missing-runbook-section',
          `The runbook must contain a non-empty ${title} section.`,
        );
    }
    const procedure = sectionByKind(document, 'procedure');
    if (
      !procedure ||
      !document.orderedLists.some(
        (list) =>
          list.start.line > procedure.heading.range.start.line &&
          list.start.line <= procedure.range.end.line,
      )
    )
      report(
        document,
        'runbook-procedure-not-numbered',
        'The Procedure section must contain numbered steps.',
      );
    for (const link of links.get(document.sourcePath) ?? [])
      if (link.broken || link.blocked)
        report(
          document,
          'invalid-runbook-link',
          `The runbook contains an unavailable or unsafe link: ${link.destination}.`,
          'error',
        );
    if (['high', 'critical'].includes(risk) && !sectionText(document, 'stop-conditions'))
      report(
        document,
        'missing-runbook-stop-conditions',
        'A high- or critical-risk runbook must contain Stop conditions.',
      );
    let freshness: string;
    if (status === 'review-required' || !date || date > options.now) {
      freshness = 'review-required';
      report(
        document,
        'runbook-review-required',
        'The runbook requires review because its date is missing, invalid, in the future, or its status requires review.',
      );
    } else if (status !== 'active') freshness = 'not-applicable';
    else if (
      options.staleDays > 0 &&
      Math.floor((options.now.getTime() - date.getTime()) / 86400000) > options.staleDays
    ) {
      freshness = 'overdue';
      report(
        document,
        'stale-runbook',
        `The runbook has not been verified for more than ${options.staleDays} days.`,
      );
    } else freshness = 'recent';
    runbooks.push({
      id,
      title: document.title,
      status: statusFor(status),
      environment,
      risk,
      lastVerified,
      freshness,
      document: document.sourcePath,
    });
  }
  const byPath = new Map(documents.map((document) => [document.sourcePath, document]));
  for (const item of standards) {
    const document = byPath.get(item.document);
    if (!document) continue;
    if (item.id && item.supersededBy === item.id)
      report(document, 'self-standard-replacement', 'A standard cannot supersede itself.', 'error');
    else if (item.supersededBy && !standardIds.has(item.supersededBy))
      report(
        document,
        'dangling-standard-replacement',
        `The standard references unknown replacement ${item.supersededBy}.`,
        'error',
      );
  }
  const official = new Set([
    'architecture',
    'contracts',
    'decisions',
    'flows',
    'guides',
    'modules',
    'quality',
    'reference',
    'runbooks',
    'screens',
    'use-cases',
    'work',
  ]);
  for (const directory of new Set(
    documents
      .filter((document) => document.sourcePath.includes('/'))
      .map((document) => document.sourcePath.split('/')[0] ?? ''),
  )) {
    const manifest = byPath.get(`${directory}/index.md`);
    if (
      !manifest &&
      (directory === 'quality' || directory === 'runbooks' || !official.has(directory))
    )
      issues.push({
        severity: 'warning',
        code: 'missing-section-manifest',
        message: `Section ${directory} must contain index.md.`,
        documentPath: directory,
      });
    if (manifest && !official.has(directory) && !manifest.description)
      report(
        manifest,
        'missing-custom-description',
        'A custom section manifest must contain a non-empty description.',
      );
  }
  standards.sort((a, b) => naturalCompare(a.id, b.id));
  runbooks.sort((a, b) => naturalCompare(a.id, b.id));
  return { standards, runbooks, standardIds, runbookIds, issues };
}
