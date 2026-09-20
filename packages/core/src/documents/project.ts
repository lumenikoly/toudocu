import type { Issue } from '@toudocu/contracts';
import {
  createDocument,
  type Document,
  type DocumentOptions,
  type DocumentSource,
} from './document.js';
import { validateDocumentBasics } from './validate.js';

export interface DocumentIndex {
  documents: Document[];
  byPath: ReadonlyMap<string, Document>;
  collections: ReadonlyMap<string, readonly Document[]>;
  directories: ReadonlySet<string>;
  healthOutputPath: string;
  issues: Issue[];
}

const rootOrder = [
  'index.md',
  'status.md',
  'roadmap.md',
  'risks.md',
  'ideas.md',
  'notes.md',
  'glossary.md',
];

/** Stable code-point order independent of the host locale, matching Go naturalCompare. */
export function naturalCompare(a: string, b: string): number {
  const left = Array.from(a.toLowerCase());
  const right = Array.from(b.toLowerCase());
  let x = 0;
  let y = 0;
  const digit = (value: string | undefined): boolean =>
    value !== undefined && /\p{Nd}/u.test(value);
  const number = (value: string): bigint =>
    /^[0-9]+$/.test(value)
      ? BigInt(value) > 0xffffffffffffffffn
        ? 0xffffffffffffffffn
        : BigInt(value)
      : 0n;
  while (x < left.length && y < right.length) {
    if (digit(left[x]) && digit(right[y])) {
      let endX = x;
      let endY = y;
      while (digit(left[endX])) endX++;
      while (digit(right[endY])) endY++;
      const nx = number(left.slice(x, endX).join(''));
      const ny = number(right.slice(y, endY).join(''));
      if (nx !== ny) return nx < ny ? -1 : 1;
      if (endX - x !== endY - y) return endX - x - (endY - y);
      x = endX;
      y = endY;
    } else {
      const lx = left[x]?.codePointAt(0) ?? 0;
      const ry = right[y]?.codePointAt(0) ?? 0;
      if (lx !== ry) return lx < ry ? -1 : 1;
      x++;
      y++;
    }
  }
  return left.length - right.length;
}

export function canonicalText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{Nd}]+/gu, ' ')
    .trim();
}

function compareDocuments(a: Document, b: Document): number {
  const aRoot = !a.sourcePath.includes('/');
  const bRoot = !b.sourcePath.includes('/');
  if (aRoot !== bRoot) return aRoot ? -1 : 1;
  if (aRoot) {
    const order = (path: string): number => {
      const index = rootOrder.indexOf(path.toLowerCase());
      return index < 0 ? 100 : index;
    };
    const difference = order(a.sourcePath) - order(b.sourcePath);
    if (difference) return difference;
  }
  return naturalCompare(a.sourcePath, b.sourcePath);
}

/** Document compilation phase only; knowledge, links and task graphs are separate phases. */
export function buildDocumentIndex(
  sources: readonly DocumentSource[],
  options: DocumentOptions,
  reservedOutputs: readonly string[] = [],
): DocumentIndex {
  const documents = sources.map((source) => createDocument(source, options)).sort(compareDocuments);
  const byPath = new Map(documents.map((document) => [document.sourcePath, document]));
  const collections = new Map<string, Document[]>();
  const directories = new Set<string>();
  const issues: Issue[] = [];
  const used = new Map(reservedOutputs.map((path) => [path.toLowerCase(), path]));
  const titles = new Map<string, Document[]>();
  for (const document of documents) {
    const stableId = document.metadata.id?.trim() ?? '';
    const prefix = { 'use-case': 'UC-', flow: 'FLOW-', screen: 'SC-' } as const;
    const expected = Object.hasOwn(prefix, document.type)
      ? prefix[document.type as keyof typeof prefix]
      : undefined;
    if (
      /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/.test(stableId) &&
      expected &&
      stableId.startsWith(expected)
    ) {
      const directory =
        document.type === 'use-case' ? 'use-cases' : document.type === 'flow' ? 'flows' : 'screens';
      document.outputPath = `${directory}/${stableId}.html`;
    }
    const previous = used.get(document.outputPath.toLowerCase());
    if (previous !== undefined) {
      const base = document.outputPath.slice(0, -5);
      let suffix = 2;
      while (used.has(`${base}-${suffix}.html`.toLowerCase())) suffix++;
      document.outputPath = `${base}-${suffix}.html`;
      issues.push({
        severity: 'error',
        code: 'output-path-collision',
        message: `Output path conflicts with ${previous}; assigned ${document.outputPath}.`,
        documentPath: document.sourcePath,
      });
    }
    used.set(document.outputPath.toLowerCase(), document.sourcePath);
    const collection = collections.get(document.type) ?? [];
    collection.push(document);
    collections.set(document.type, collection);
    let directory = document.directory;
    while (directory !== '.' && directory) {
      directories.add(directory);
      const slash = directory.lastIndexOf('/');
      directory = slash < 0 ? '.' : directory.slice(0, slash);
    }
    const title = canonicalText(document.title);
    if (title) {
      const group = titles.get(title) ?? [];
      group.push(document);
      titles.set(title, group);
    }
    issues.push(...validateDocumentBasics(document));
  }
  if (!byPath.has('index.md'))
    issues.push({
      severity: 'warning',
      code: 'missing-index',
      message: 'Required file index.md is missing.',
    });
  if (!byPath.has('architecture/overview.md'))
    issues.push({
      severity: 'error',
      code: 'missing-architecture-overview',
      message: 'Required file architecture/overview.md is missing.',
      documentPath: 'architecture/overview.md',
    });
  for (const group of titles.values()) {
    if (group.length < 2) continue;
    for (const document of group)
      issues.push({
        severity: 'warning',
        code: 'duplicate-title',
        message: `Heading ${JSON.stringify(document.title)} is used by multiple documents.`,
        documentPath: document.sourcePath,
      });
  }
  const healthOutputPath =
    ['health.html', 'documentation-health.html', '_project-docs/health.html'].find(
      (path) => !used.has(path),
    ) ?? 'health.html';
  return { documents, byPath, collections, directories, healthOutputPath, issues };
}
