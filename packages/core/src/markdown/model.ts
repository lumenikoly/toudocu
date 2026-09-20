import type { SourceRange } from './source-position.js';

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  range: SourceRange;
}
export interface Heading {
  level: number;
  title: string;
  id: string;
  range: SourceRange;
}
export interface MetadataItem {
  key: string;
  rawKey: string;
  value: string;
  range: SourceRange;
}
export interface Task {
  completed: boolean;
  text: string;
  headingId: string;
  headingTitle: string;
  indent: number;
  range: SourceRange;
}
export interface ListItem {
  text: string;
  ordered: boolean;
  range: SourceRange;
}
export interface Link {
  image: boolean;
  label: string;
  destination: string;
  title: string;
  automatic: boolean;
  range: SourceRange;
}
export interface CodeBlock {
  info: string;
  source: string;
  fenced: boolean;
  closed: boolean;
  range: SourceRange;
}
export interface MermaidBlock {
  source: string;
  range: SourceRange;
}
export interface TableRow {
  cells: string[];
  range: SourceRange;
}
export interface Table {
  headers: string[];
  rows: TableRow[];
  alignments: string[];
  kind: string;
  columns: string[];
  range: SourceRange;
}
export interface Section {
  heading: Heading;
  kind: string;
  metadata: MetadataItem[];
  tasks: Task[];
  text: string;
  markdown: string;
  range: SourceRange;
  children: Section[];
}
export interface MarkdownAnalysis {
  title: string;
  description: string;
  plainText: string;
  headings: Heading[];
  sections: Section[];
  metadata: MetadataItem[];
  tasks: Task[];
  listItems: ListItem[];
  links: Link[];
  codeBlocks: CodeBlock[];
  mermaidBlocks: MermaidBlock[];
  tables: Table[];
  orderedLists: SourceRange[];
  diagnostics: Diagnostic[];
  metadataBlocks: number;
}
