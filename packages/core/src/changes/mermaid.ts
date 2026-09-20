import type { ChangeSetReportV1 } from '@toudocu/contracts';
import type { MarkdownAnalysis } from '../markdown/model.js';

type Change = ChangeSetReportV1['changes'][number];
type MermaidBlockChange = Change['mermaidBlocks'][number];
type Issue = ChangeSetReportV1['diagnostics'][number];
type ChangeLocation = NonNullable<MermaidBlockChange['sourceBefore']>;

interface MermaidBlock {
  id: string;
  caption: string;
  source: string;
  line: number;
}

const asciiWhitespace = '[\\t\\n\\f\\r ]';
const explicitId = new RegExp(
  `^${asciiWhitespace}*%%${asciiWhitespace}*(?:id|diagram-id)${asciiWhitespace}*:${asciiWhitespace}*([A-Za-z0-9._-]+)${asciiWhitespace}*$`,
  'imu',
);
const semanticWhitespace =
  /[\t-\r \u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/gu;
const knownDiagramTypes = new Set([
  'flowchart',
  'graph',
  'sequencediagram',
  'classdiagram',
  'statediagram',
  'statediagram-v2',
  'erdiagram',
  'journey',
  'gantt',
  'pie',
  'mindmap',
  'timeline',
  'gitgraph',
  'quadrantchart',
  'xychart-beta',
  'block-beta',
  'sankey-beta',
]);

export function mermaidBlockDiff(
  oldAnalysis: MarkdownAnalysis,
  newAnalysis: MarkdownAnalysis,
  oldPath: string,
  newPath: string,
  diagnostics: Issue[] = [],
): [MermaidBlockChange[], Issue[]] {
  const oldBlocks = extractMermaidBlocks(oldAnalysis);
  const newBlocks = extractMermaidBlocks(newAnalysis);
  const nextDiagnostics = [...diagnostics];

  if (oldBlocks.ambiguous || newBlocks.ambiguous) {
    nextDiagnostics.push({
      severity: 'warning',
      code: 'mermaid-block-match-ambiguous',
      message: 'Mermaid blocks cannot be matched unambiguously; use %% id: <stable-id>.',
      documentPath: newPath,
    });
  }

  const ids = new Set([...oldBlocks.blocks.keys(), ...newBlocks.blocks.keys()]);
  const orderedIds = [...ids].sort();
  const changes: MermaidBlockChange[] = [];

  for (const id of orderedIds) {
    const oldBlock = oldBlocks.blocks.get(id);
    const newBlock = newBlocks.blocks.get(id);

    if (
      oldBlock &&
      newBlock &&
      normalizeSemanticText(oldBlock.source) === normalizeSemanticText(newBlock.source)
    ) {
      continue;
    }

    let status = 'added';
    if (oldBlock && newBlock) {
      status = 'modified';
    } else if (oldBlock) {
      status = 'removed';
    }

    const caption = newBlock?.caption || oldBlock?.caption || '';
    const change: MermaidBlockChange = { id, status };

    if (caption) {
      change.caption = caption;
    }

    if (oldBlock) {
      if (oldBlock.source) {
        change.before = oldBlock.source;
      }
      change.sourceBefore = sourceLocation(oldPath, oldBlock.line);

      if (!validMermaidSource(oldBlock.source)) {
        nextDiagnostics.push({
          severity: 'warning',
          code: 'mermaid-old-version-invalid',
          message: 'The old Mermaid block version is unrecognized; source text remains available.',
          documentPath: oldPath,
          line: oldBlock.line,
        });
      }
    }

    if (newBlock) {
      if (newBlock.source) {
        change.after = newBlock.source;
      }
      change.sourceAfter = sourceLocation(newPath, newBlock.line);

      if (!validMermaidSource(newBlock.source)) {
        nextDiagnostics.push({
          severity: 'warning',
          code: 'mermaid-new-version-invalid',
          message: 'The new Mermaid block version is unrecognized; source text remains available.',
          documentPath: newPath,
          line: newBlock.line,
        });
      }
    }

    changes.push(change);
  }

  return [changes, nextDiagnostics];
}

function extractMermaidBlocks(analysis: MarkdownAnalysis): {
  blocks: Map<string, MermaidBlock>;
  ambiguous: boolean;
} {
  const blocks = new Map<string, MermaidBlock>();
  const sectionCounts = new Map<string, number>();
  let ambiguous = false;

  for (const block of analysis.mermaidBlocks) {
    const line = block.range.start.line;
    const context = mermaidContext(analysis, line);
    const count = (sectionCounts.get(context.id) ?? 0) + 1;
    sectionCounts.set(context.id, count);

    const explicitMatch = explicitId.exec(block.source);
    let id = `${context.id}-mermaid-${count}`;
    if (explicitMatch) {
      id = `id-${explicitMatch[1]}`;
    }

    if (blocks.has(id)) {
      ambiguous = true;
      continue;
    }

    blocks.set(id, {
      id,
      caption: context.caption,
      source: block.source,
      line,
    });
  }

  return { blocks, ambiguous };
}

function mermaidContext(
  analysis: MarkdownAnalysis,
  line: number,
): {
  id: string;
  caption: string;
} {
  let id = 'document';
  let caption = '';

  for (const heading of analysis.headings) {
    if (heading.range.start.line > line) {
      break;
    }

    if (heading.level <= 2) {
      id = heading.id;
      caption = heading.title;
    }
  }

  return { id, caption };
}

export function normalizeSemanticText(value: string): string {
  return semanticFields(value).join(' ');
}

function validMermaidSource(source: string): boolean {
  for (const line of source.split('\n')) {
    const fields = semanticFields(line);
    if (!fields.length || fields[0]?.startsWith('%%')) {
      continue;
    }

    const diagramType = fields[0]?.toLowerCase();
    return diagramType !== undefined && knownDiagramTypes.has(diagramType);
  }

  return false;
}

function semanticFields(value: string): string[] {
  return value.split(semanticWhitespace).filter(Boolean);
}

function sourceLocation(path: string, line: number): ChangeLocation {
  return { path, line };
}
