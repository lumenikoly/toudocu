import { parseMarkdown, type MarkdownDocument } from '../markdown/parse.js';
import { sectionTypes, type SectionType } from '../config/config.js';
import type {
  CodeBlock,
  Diagnostic,
  Heading,
  Link,
  ListItem,
  MarkdownAnalysis,
  MermaidBlock,
  Section,
  Table,
  Task,
} from '../markdown/model.js';

export interface DocumentSource {
  sourcePath: string;
  content: string;
  modifiedAt: Date;
}

export interface DocumentOptions {
  now: Date;
  staleDays: number;
}

export interface DocumentStatus {
  kind: string;
  symbol: string;
  label: string;
  recognized: boolean;
}

export interface TaskStats {
  total: number;
  completed: number;
  remaining: number;
  percent: number | null;
}

export type DocumentSectionType = SectionType | '';

export type DocumentType =
  | 'overview'
  | 'status'
  | 'roadmap'
  | 'risks'
  | 'notes'
  | 'ideas'
  | 'use-case'
  | 'module'
  | 'architecture'
  | 'contract'
  | 'decision'
  | 'flow'
  | 'guide'
  | 'draft'
  | 'reference'
  | 'quality-index'
  | 'standard'
  | 'runbook-index'
  | 'runbook'
  | 'screen-map'
  | 'screen-index'
  | 'screen'
  | 'changelog'
  | 'work'
  | 'document';

export interface Document {
  id: string;
  sourcePath: string;
  outputPath: string;
  directory: string;
  fileName: string;
  type: DocumentType;
  sectionType: DocumentSectionType;
  typeLabel: string;
  title: string;
  description: string;
  content: string;
  headings: Heading[];
  markdown: MarkdownDocument;
  sections: Section[];
  metadata: Record<string, string>;
  metadataItems: MarkdownAnalysis['metadata'];
  metadataBlocks: number;
  tasks: Task[];
  taskStats: TaskStats;
  links: Link[];
  listItems: ListItem[];
  orderedLists: MarkdownAnalysis['orderedLists'];
  codeBlocks: CodeBlock[];
  mermaidBlocks: MermaidBlock[];
  tables: Table[];
  plainText: string;
  diagnostics: Diagnostic[];
  modifiedAt: Date;
  updatedAt: Date;
  ageDays: number;
  stale: boolean;
  status: DocumentStatus;
}

const statusGroups: Readonly<Record<string, { kind: string; symbol: string }>> = {
  draft: { kind: 'not-started', symbol: '-' },
  ready: { kind: 'planned', symbol: '~' },
  planned: { kind: 'planned', symbol: '~' },
  proposed: { kind: 'planned', symbol: '~' },
  'in-progress': { kind: 'in-progress', symbol: '=' },
  active: { kind: 'in-progress', symbol: '=' },
  blocked: { kind: 'blocked', symbol: '!' },
  paused: { kind: 'paused', symbol: '=' },
  done: { kind: 'done', symbol: '+' },
  open: { kind: 'open', symbol: '-' },
  accepted: { kind: 'accepted', symbol: '+' },
  rejected: { kind: 'rejected', symbol: 'x' },
  cancelled: { kind: 'cancelled', symbol: 'x' },
  superseded: { kind: 'superseded', symbol: '>' },
  obsolete: { kind: 'obsolete', symbol: 'x' },
  'review-required': { kind: 'review-required', symbol: '!' },
  'risk-accepted': { kind: 'risk-accepted', symbol: '=' },
};

const typeLabels: Readonly<Record<DocumentType, string>> = {
  overview: 'Project overview',
  status: 'Current status',
  roadmap: 'Roadmap',
  risks: 'Risks',
  notes: 'Notes',
  ideas: 'Ideas',
  'use-case': 'Use case',
  module: 'Module',
  architecture: 'Architecture',
  contract: 'Contract catalog',
  decision: 'Architecture decision',
  flow: 'Flow',
  guide: 'Guide',
  draft: 'Draft',
  reference: 'Reference',
  'quality-index': 'Quality standards',
  standard: 'Standard',
  'runbook-index': 'Runbooks',
  runbook: 'Runbook',
  'screen-map': 'Legacy screen map',
  'screen-index': 'Screens',
  screen: 'Screen',
  changelog: 'Project changelog',
  work: 'Work items',
  document: 'Document',
};

/** Classify a canonical relative Markdown path using the legacy path rules. */
export function classifyDocument(relativePath: string): DocumentType {
  const normalized = normalizeSlashes(relativePath).toLowerCase();
  const base = basename(normalized);
  const section = sectionTypeForPath(normalized);
  switch (normalized) {
    case 'index.md':
      return 'overview';
    case 'status.md':
      return 'status';
    case 'roadmap.md':
      return 'roadmap';
    case 'risks.md':
      return 'risks';
    case 'notes.md':
      return 'notes';
    case 'ideas.md':
      return 'ideas';
  }
  switch (section) {
    case 'use-cases':
      return 'use-case';
    case 'modules':
      return 'module';
    case 'architecture':
      return 'architecture';
    case 'contracts':
      return 'contract';
    case 'decisions':
      return 'decision';
    case 'flows':
      return 'flow';
    case 'guides':
      return 'guide';
    case 'drafts':
      return 'draft';
    case 'reference':
      return 'reference';
    case 'quality':
      if (base === 'index.md') return 'quality-index';
      if (base.startsWith('std-')) return 'standard';
      break;
    case 'runbooks':
      if (base === 'index.md') return 'runbook-index';
      if (base.startsWith('rb-')) return 'runbook';
      break;
    case 'screens':
      if (base === 'map.md') return 'screen-map';
      if (base === 'index.md') return 'screen-index';
      if (base.startsWith('sc-')) return 'screen';
      break;
    case 'work':
      if (base.startsWith('task-') || base.startsWith('bug-')) return 'work';
      break;
  }
  return 'document';
}

/** Map a canonical status to the legacy presentation group. */
export function statusFor(status: string): DocumentStatus {
  const label = status.trim();
  if (!label) return { kind: 'neutral', symbol: '.', label: '', recognized: true };
  const group = Object.hasOwn(statusGroups, label) ? statusGroups[label] : undefined;
  return group
    ? { ...group, label, recognized: true }
    : { kind: 'neutral', symbol: '.', label, recognized: false };
}

export function outputPathForDocument(relativePath: string): string {
  const normalized = normalizeSlashes(relativePath);
  return /\.md$/iu.test(normalized) ? `${normalized.slice(0, -3)}.html` : `${normalized}.html`;
}

export function createDocument(source: DocumentSource, options: DocumentOptions): Document {
  const parsed = parseMarkdown(source.content, source.sourcePath);
  const normalizedPath = normalizeSlashes(source.sourcePath);
  const type = classifyDocument(source.sourcePath);
  const metadata = metadataRecord(parsed.analysis.metadata);
  const updatedAt = documentDate(metadata, source.modifiedAt);
  const now = options.now.getTime();
  const ageDays = Math.trunc((now - updatedAt.getTime()) / 86_400_000) || 0;
  const completed = parsed.analysis.tasks.filter((task) => task.completed).length;
  const total = parsed.analysis.tasks.length;
  const fallback = fallbackTitle(normalizedPath);
  const modifiedAt = new Date(source.modifiedAt.getTime());

  return {
    id: source.sourcePath,
    sourcePath: normalizedPath,
    outputPath: outputPathForDocument(source.sourcePath),
    directory: directory(normalizedPath),
    fileName: basename(normalizedPath),
    type,
    sectionType: sectionTypeForPath(normalizedPath),
    typeLabel: typeLabels[type],
    title: parsed.analysis.title || fallback,
    description: parsed.analysis.description,
    content: source.content,
    markdown: parsed,
    headings: parsed.analysis.headings,
    sections: parsed.analysis.sections,
    metadata,
    metadataItems: parsed.analysis.metadata,
    metadataBlocks: parsed.analysis.metadataBlocks,
    tasks: parsed.analysis.tasks,
    taskStats: {
      total,
      completed,
      remaining: total - completed,
      percent: total ? Math.round((completed / total) * 100) : null,
    },
    links: parsed.analysis.links,
    listItems: parsed.analysis.listItems,
    orderedLists: parsed.analysis.orderedLists,
    codeBlocks: parsed.analysis.codeBlocks,
    mermaidBlocks: parsed.analysis.mermaidBlocks,
    tables: parsed.analysis.tables,
    plainText: parsed.analysis.plainText,
    diagnostics: parsed.analysis.diagnostics,
    modifiedAt,
    updatedAt,
    ageDays,
    stale: options.staleDays > 0 && ageDays > options.staleDays,
    status: statusFor(metadata.status ?? ''),
  };
}

function metadataRecord(items: MarkdownAnalysis['metadata']): Record<string, string> {
  const result = Object.create(null) as Record<string, string>;
  for (const item of items)
    if (!Object.hasOwn(result, item.key)) result[item.key] = item.value.trim();
  return result;
}

function documentDate(metadata: Record<string, string>, modifiedAt: Date): Date {
  const updated = metadata.updated;
  if (updated) {
    const date = parseISODate(updated);
    if (date) return date;
  } else if (metadata.date) {
    const date = parseISODate(metadata.date);
    if (date) return date;
  }
  return new Date(modifiedAt.getTime());
}

export function parseISODate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return undefined;
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const result = new Date(0);
  result.setUTCFullYear(year, month - 1, day);
  return result.getUTCFullYear() === year &&
    result.getUTCMonth() === month - 1 &&
    result.getUTCDate() === day
    ? result
    : undefined;
}

function sectionTypeForPath(relativePath: string): DocumentSectionType {
  const first = relativePath.toLowerCase().split('/')[0] ?? '';
  return sectionTypes.includes(first as SectionType) ? (first as SectionType) : '';
}

function normalizeSlashes(value: string): string {
  return value.replaceAll('\\', '/');
}

function basename(value: string): string {
  return value.slice(value.lastIndexOf('/') + 1);
}

function directory(value: string): string {
  const slash = value.lastIndexOf('/');
  return slash < 0 ? '.' : value.slice(0, slash) || '.';
}

function fallbackTitle(value: string): string {
  const file = basename(value);
  const extension = /\.[^.]*$/u.exec(file)?.[0] ?? '';
  const withoutExtension = extension ? file.slice(0, -extension.length) : file;
  const words = withoutExtension.replaceAll('-', ' ').replaceAll('_', ' ');
  const first = Array.from(words)[0];
  return first ? first.toUpperCase() + words.slice(first.length) : words;
}
