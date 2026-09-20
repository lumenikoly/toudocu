import { canonicalText, naturalCompare, type CompiledProject } from '@toudocu/core';
import { SearchReportV1Schema, ToudocuError, type SearchReportV1 } from '@toudocu/contracts';

const words = (value: string): string[] => canonicalText(value).split(' ').filter(Boolean);
function contains(value: string, terms: readonly string[]): boolean {
  const available = new Set(words(value));
  return terms.every((term) => available.has(term));
}

/** Deterministic read-only search; ranking mirrors the version-one CLI contract. */
export function searchDocumentation(
  project: CompiledProject,
  query: string,
  limit: number,
  version: string,
): SearchReportV1 {
  const terms = [...new Set(words(query))];
  if (!terms.length) throw new ToudocuError('invalid_search_query', 'search query cannot be empty');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new ToudocuError('invalid_search_limit', '--limit must be a number from 1 to 100');
  const normalizedQuery = terms.join(' ');
  const found: { match: SearchReportV1['results'][number]; rank: number }[] = [];
  for (const document of project.index.documents) {
    const id = document.metadata.id?.trim() ?? '';
    if (!contains([id, document.title, document.sourcePath, document.plainText].join(' '), terms))
      continue;
    const matchedSections = document.sections
      .filter((section) => contains(`${section.heading.title} ${section.text}`, terms))
      .map((section) => section.heading.title);
    let rank = 5;
    if (id && words(id).join(' ') === normalizedQuery) rank = 0;
    else {
      const withoutId =
        id && document.title.startsWith(id) ? document.title.slice(id.length) : document.title;
      const title = words(id ? withoutId.replace(/^[:—\- ]+/u, '').trim() : withoutId).join(' ');
      if (title === normalizedQuery || title.startsWith(`${normalizedQuery} `)) rank = 1;
      else if (contains(document.title, terms)) rank = 2;
      else if (document.sections.some((section) => contains(section.heading.title, terms)))
        rank = 3;
      else if (contains(document.sourcePath, terms)) rank = 4;
    }
    const parts = document.sourcePath.split('/');
    const archived = parts[0] === 'work' && parts[1] === 'archive';
    const archiveYear =
      archived && parts.length === 4 && /^\d{4}$/u.test(parts[2] ?? '') ? parts[2] : undefined;
    found.push({
      rank,
      match: {
        ...(id &&
        ['module', 'use-case', 'flow', 'screen', 'decision', 'work'].includes(document.type)
          ? { id }
          : {}),
        type: document.type,
        title: document.title,
        path: document.sourcePath,
        archived,
        ...(archiveYear ? { archiveYear } : {}),
        matchedSections,
      },
    });
  }
  found.sort((a, b) => a.rank - b.rank || naturalCompare(a.match.path, b.match.path));
  return SearchReportV1Schema.parse({
    schemaVersion: 1,
    kind: 'search',
    generator: { name: 'Toudocu', version },
    query,
    total: found.length,
    limit,
    results: found.slice(0, limit).map((item) => item.match),
  });
}

export function formatSearchText(report: SearchReportV1): string {
  return (
    report.results
      .map(
        (result) =>
          `${result.id ? `${result.id} — ` : ''}${result.title} [${result.type}] ${result.path}\n${result.matchedSections.length ? `  Sections: ${result.matchedSections.join(', ')}\n` : ''}`,
      )
      .join('') + `Found: ${report.total}\n`
  );
}
