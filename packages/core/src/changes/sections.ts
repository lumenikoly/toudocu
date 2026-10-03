import type { ChangeSetReportV1 } from '@toudocu/contracts';
import type { MarkdownAnalysis, Section } from '../markdown/model.js';
import { normalizeSemanticText } from './mermaid.js';

type RenderedSectionChange = ChangeSetReportV1['changes'][number]['renderedSections'][number];
type Issue = ChangeSetReportV1['diagnostics'][number];

interface IndexedSection {
  section: Section;
  index: number;
}

export function renderedSectionDiff(
  oldAnalysis: MarkdownAnalysis,
  newAnalysis: MarkdownAnalysis,
  oldPath: string,
  newPath: string,
  diagnostics: Issue[] = [],
): [RenderedSectionChange[], Issue[]] {
  const oldByID = indexSections(oldAnalysis);
  const newByID = indexSections(newAnalysis);
  const ids = new Set([...oldByID.keys(), ...newByID.keys()]);
  const orderedIDs = [...ids].sort();
  const changes: RenderedSectionChange[] = [];
  const nextDiagnostics = [...diagnostics];

  for (const id of orderedIDs) {
    const oldSections = oldByID.get(id) ?? [];
    const newSections = newByID.get(id) ?? [];
    if (oldSections.length > 1 || newSections.length > 1) {
      nextDiagnostics.push({
        severity: 'warning',
        code: 'rendered-section-match-ambiguous',
        message: `Section with anchor ${id} cannot be matched unambiguously.`,
        documentPath: newPath,
      });
      continue;
    }

    const oldEntry = oldSections[0];
    const newEntry = newSections[0];
    const status = sectionStatus(oldEntry, newEntry);
    const change: RenderedSectionChange = { id, status };

    if (oldEntry) {
      if (oldEntry.section.heading.title) {
        change.titleBefore = oldEntry.section.heading.title;
      }
      if (oldEntry.section.heading.id) {
        change.anchorBefore = oldEntry.section.heading.id;
      }
      change.sourceBefore = sectionLocation(oldPath, oldEntry.section);
    }
    if (newEntry) {
      if (newEntry.section.heading.title) {
        change.titleAfter = newEntry.section.heading.title;
      }
      if (newEntry.section.heading.id) {
        change.anchorAfter = newEntry.section.heading.id;
      }
      change.sourceAfter = sectionLocation(newPath, newEntry.section);
    }
    changes.push(change);
  }

  return [changes, nextDiagnostics];
}

function indexSections(analysis: MarkdownAnalysis): Map<string, IndexedSection[]> {
  const indexed = new Map<string, IndexedSection[]>();
  let index = 0;
  for (const section of analysis.sections) {
    if (section.heading.level !== 2) {
      continue;
    }
    const entries = indexed.get(section.heading.id) ?? [];
    entries.push({ section, index });
    indexed.set(section.heading.id, entries);
    index++;
  }
  return indexed;
}

function sectionStatus(
  oldEntry: IndexedSection | undefined,
  newEntry: IndexedSection | undefined,
): string {
  if (!oldEntry) {
    return 'added-section';
  }
  if (!newEntry) {
    return 'removed-section';
  }
  if (
    normalizeSemanticText(oldEntry.section.markdown) !==
      normalizeSemanticText(newEntry.section.markdown) ||
    oldEntry.section.heading.title !== newEntry.section.heading.title
  ) {
    return 'modified-section';
  }
  if (oldEntry.index !== newEntry.index) {
    return 'moved-section';
  }
  return 'unchanged-section';
}

function sectionLocation(
  path: string,
  section: Section,
): NonNullable<RenderedSectionChange['sourceBefore']> {
  const line = section.heading.range.start.line - 1;
  return line ? { path, line } : { path };
}
