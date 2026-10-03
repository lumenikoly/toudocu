import type { Issue } from '@toudocu/contracts';
import type { Document } from './document.js';
import { validateSemanticAnnotations } from './semantic.js';

const requiredSections: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'use-case': {
    'main-scenario': 'Main scenario',
    postconditions: 'Postconditions',
    'business-rules': 'Business rules',
    implementation: 'Implementation',
  },
  module: {
    'code-location': 'Code location',
    boundaries: 'Boundaries',
    'business-rules': 'Business rules',
    invariants: 'Invariants',
    'stable-interfaces': 'Stable interfaces',
    'related-use-cases': 'Related use cases',
  },
  decision: { context: 'Context', decision: 'Decision', consequences: 'Consequences' },
};

/** File-local checks; relationship and typed-entity checks run on the project. */
export function validateDocumentBasics(document: Document): Issue[] {
  const issues: Issue[] = document.diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    documentPath: document.sourcePath,
    line: diagnostic.range.start.line,
  }));
  issues.push(...validateSemanticAnnotations(document));
  const warn = (code: string, message: string): void => {
    issues.push({ severity: 'warning', code, message, documentPath: document.sourcePath });
  };
  if (document.type === 'notes' || document.type === 'ideas') return issues;
  if (!document.content.trim()) warn('empty-document', 'The document is empty.');
  if (!document.headings.some((heading) => heading.level === 1))
    warn('missing-h1', 'The document has no level-one heading.');
  if (
    !document.description &&
    ['overview', 'module', 'use-case', 'architecture', 'decision'].includes(document.type)
  )
    warn('missing-description', 'The document has no introductory description.');
  if (document.stale)
    warn('stale-document', `The document has not been updated for ${document.ageDays} days.`);
  if (document.metadata.status && !document.status.recognized)
    warn('unknown-status', `Unknown status ${JSON.stringify(document.metadata.status)}.`);
  if (
    !document.metadata.status &&
    ['status', 'use-case', 'module', 'decision'].includes(document.type)
  )
    warn('missing-status', 'The Status field is missing.');
  const sections = Object.hasOwn(requiredSections, document.type)
    ? requiredSections[document.type]
    : undefined;
  for (const [kind, title] of Object.entries(sections ?? {})) {
    if (!document.sections.some((section) => section.heading.level === 2 && section.kind === kind))
      warn('missing-section', `The ${title} section is missing.`);
  }
  return issues;
}
