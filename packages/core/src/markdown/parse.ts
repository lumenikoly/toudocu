import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import type { Nodes, Root } from 'mdast';
import { extractAnnotations } from './annotations.js';
import { SourcePositionMapper, type SourceRange } from './source-position.js';
import type { Heading, MarkdownAnalysis, Section, Table } from './model.js';
import { renderMarkdown, type RenderOptions } from './render.js';

export interface MarkdownDocument {
  source: string;
  sourcePath: string;
  analysis: MarkdownAnalysis;
  render(options?: RenderOptions): string;
}

export function normalizeMarkdown(source: string): string {
  return source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{Nd}\s_-]/gu, '')
      .trim()
      .replace(/[\s_-]+/gu, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

function textOf(node: Nodes): string {
  if (node.type === 'code' || node.type === 'html' || node.type === 'definition') return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value.replace(/\s+/g, ' ');
  if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
  if (node.type === 'break') return ' ';
  if ('children' in node) {
    const block = ['root', 'blockquote', 'list', 'listItem', 'table', 'tableRow'].includes(
      node.type,
    );
    return node.children
      .map((child) => textOf(child))
      .filter(Boolean)
      .join(block ? ' ' : '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function startOf(node: Nodes): number {
  return node.position?.start.offset ?? 0;
}
function endOf(node: Nodes): number {
  return node.position?.end.offset ?? 0;
}

function lastCodeBlock(node: Nodes): Extract<Nodes, { type: 'code' }> | undefined {
  let result: Extract<Nodes, { type: 'code' }> | undefined;
  const visit = (current: Nodes): void => {
    if (current.type === 'code') {
      result = current;
      return;
    }
    if ('children' in current) {
      for (const child of current.children) {
        visit(child as Nodes);
      }
    }
  };
  visit(node);
  return result;
}

function listItemEnd(source: string, node: Nodes, start: number, end: number): number {
  const code = lastCodeBlock(node);
  if (code?.position) {
    const codeStart = code.position.start.offset ?? 0;
    const codeEnd = code.position.end.offset ?? codeStart;
    const codeSource = source.slice(codeStart, codeEnd);
    const opening = /^(\x60{3,}|~{3,})/.exec(codeSource);
    const trailing = source.slice(codeEnd, end);
    if (opening && trailing.trim() === '') {
      const marker = opening[1] ?? '';
      const lines = codeSource.split('\n');
      const openingLineStart = source.lastIndexOf('\n', codeStart - 1) + 1;
      const openingIndent =
        source.slice(openingLineStart, codeStart).match(/^[ \t]*/u)?.[0].length ?? 0;
      const closing =
        lines.length > 1 &&
        new RegExp(
          `^[ \\t]{0,${openingIndent + 3}}${marker[0] === '~' ? '~' : '\x60'}{${marker.length},}[ \\t]*$`,
        ).test(lines.at(-1) ?? '');
      if (closing) {
        return codeStart + codeSource.lastIndexOf('\n') + 1;
      }
      if (!code.value && codeEnd >= source.length - 1) {
        let previous = codeStart;
        while (previous > start && /[ \t]/u.test(source[previous - 1] ?? '')) {
          previous -= 1;
        }
        if (previous > start && source[previous - 1] === '\n') {
          previous -= 1;
        }
        return previous;
      }
    }
  }
  return end;
}

/** Goldmark bounds body rows to header width, including its zero-offset padded cells. */
function normalizeTableRows(node: Nodes): void {
  if (node.type === 'table') {
    const width = node.children[0]?.children.length ?? 0;
    for (const row of node.children.slice(1)) {
      if (row.children.length > width) {
        row.children.length = width;
        const end = row.children.at(-1)?.position?.end;
        if (row.position && end) row.position.end = end;
      }
      if (row.children.length < width) {
        if (row.position) row.position.start = { line: 1, column: 1, offset: 0 };
        while (row.children.length < width) row.children.push({ type: 'tableCell', children: [] });
      }
    }
  }
  if ('children' in node) for (const child of node.children) normalizeTableRows(child);
}

// Preserve legacy destination spelling in analysis; the renderer uses decoded AST URLs.
function destinationToken(raw: string, definition = false): string | undefined {
  const marker = definition ? raw.indexOf(']:') : raw.lastIndexOf('](');
  if (marker < 0) return undefined;
  let offset = marker + 2;
  while (/\s/.test(raw[offset] ?? '') && offset < raw.length) offset++;
  const angle = raw[offset] === '<';
  if (angle) offset++;
  const start = offset;
  let depth = 0;
  while (offset < raw.length) {
    const character = raw[offset];
    if (character === '\\') {
      offset += 2;
      continue;
    }
    if (
      (angle && character === '>') ||
      (!angle && (/\s/.test(character ?? '') || (character === ')' && depth === 0)))
    )
      break;
    if (character === '(') depth++;
    if (character === ')') depth--;
    offset++;
  }
  return raw.slice(start, offset);
}

function pointAt(source: string, offset: number): { line: number; column: number; offset: number } {
  const prefix = source.slice(0, offset);
  const lineStart = prefix.lastIndexOf('\n') + 1;
  return { line: prefix.split('\n').length, column: offset - lineStart + 1, offset };
}

function repairMalformedLinks(root: Root, source: string): void {
  const repairChildren = (children: Nodes[]): void => {
    for (let index = 0; index + 2 < children.length; index++) {
      const first = children[index];
      const middle = children[index + 1];
      const last = children[index + 2];
      if (
        !first ||
        !middle ||
        !last ||
        first.type !== 'text' ||
        middle.type !== 'link' ||
        last.type !== 'text'
      )
        continue;
      const firstStart = first.position?.start.offset ?? 0;
      const middleStart = middle.position?.start.offset ?? 0;
      const middleEnd = middle.position?.end.offset ?? 0;
      const lastEnd = last.position?.end.offset ?? 0;
      const prefix = source.slice(firstStart, middleStart);
      const marker = prefix.lastIndexOf('[');
      const openerStart = firstStart + marker;
      const opener = source.slice(openerStart, middleStart);
      if (marker < 0 || !/^\[[^\]\\\n]*\]\($/.test(opener)) continue;
      // The opener must be a real link opener.  Goldmark leaves an escaped
      // opener and an image opener in text around the link-shaped node; do
      // not turn either incidental shape into a synthetic link.
      const beforeOpener = source[openerStart - 1];
      if (beforeOpener === '!' || beforeOpener === '\\') continue;
      const tail = source.slice(middleEnd, lastEnd);
      const titleMatch = /^\s+(?:"([^"]*)"|'([^']*)')\)/.exec(tail);
      if (!titleMatch || middle.children.length !== 1 || middle.children[0]?.type !== 'text')
        continue;
      const destination = source.slice(middleStart, middleEnd);
      if (destination !== middle.children[0].value || destination.length === 0) continue;
      // Text node values are already entity/backslash-decoded by mdast.
      // Slice those values, rather than raw source, when retaining text on
      // either side of the repaired link.
      const openerValueStart = first.value.lastIndexOf(opener);
      const titleValueStart = last.value.indexOf(titleMatch[0]);
      if (openerValueStart < 0 || titleValueStart < 0) continue;
      const labelEnd = middleStart - 2;
      const linkEnd = middleEnd + titleMatch[0].length;
      const link: Nodes = {
        type: 'link',
        title: titleMatch[1] ?? titleMatch[2] ?? '',
        url: destination,
        children: [
          {
            type: 'text',
            value: opener.slice(1, -2),
            position: {
              start: pointAt(source, openerStart + 1),
              end: pointAt(source, labelEnd),
            },
          },
        ],
        position: { start: pointAt(source, openerStart), end: pointAt(source, linkEnd) },
      };
      const replacement: Nodes[] = [];
      if (openerStart > firstStart)
        replacement.push({
          ...first,
          value: first.value.slice(0, openerValueStart),
          position: {
            start: first.position?.start ?? pointAt(source, firstStart),
            end: pointAt(source, openerStart),
          },
        });
      replacement.push(link);
      if (linkEnd < lastEnd)
        replacement.push({
          ...last,
          value: last.value.slice(titleValueStart + titleMatch[0].length),
          position: {
            start: pointAt(source, linkEnd),
            end: last.position?.end ?? pointAt(source, lastEnd),
          },
        });
      children.splice(index, 3, ...replacement);
      index += replacement.length - 1;
    }
  };
  const visit = (node: Nodes): void => {
    if (node.type === 'code' || node.type === 'html') return;
    if ('children' in node) {
      repairChildren(node.children);
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
}

/** The parser tree stays private; consumers receive semantic records and safe HTML. */
export function parseMarkdown(input: string, sourcePath = ''): MarkdownDocument {
  const source = normalizeMarkdown(input);
  const positions = new SourcePositionMapper(source);
  const { parsed, annotations, diagnostics } = extractAnnotations(source, positions);
  const tree: Root = fromMarkdown(parsed, {
    extensions: [
      gfm(),
      {
        disable: { null: ['gfmFootnoteDefinition', 'gfmFootnoteCall', 'gfmPotentialFootnoteCall'] },
      },
    ],
    mdastExtensions: [gfmFromMarkdown()],
  });
  repairMalformedLinks(tree, parsed);
  normalizeTableRows(tree);
  const range = (start: number, end: number): SourceRange => ({
    start: positions.positionAt(start),
    end: positions.positionAt(end),
  });
  const analysis: MarkdownAnalysis = {
    title: '',
    description: '',
    plainText: '',
    headings: [],
    sections: [],
    metadata: [],
    tasks: [],
    listItems: [],
    links: [],
    codeBlocks: [],
    mermaidBlocks: [],
    tables: [],
    orderedLists: [],
    diagnostics,
    metadataBlocks: 0,
  };
  const headings: { node: Nodes; heading: Heading; start: number; end: number }[] = [];
  const tables: { table: Table; start: number }[] = [];
  const usedIds = new Map<string, number>();
  let current: Heading | undefined;

  const contentEnd = (node: Nodes): number => {
    if (node.type === 'link' || node.type === 'linkReference') {
      return Math.max(startOf(node), ...node.children.map(contentEnd));
    }
    if (node.type === 'emphasis' || node.type === 'strong' || node.type === 'delete') {
      return Math.max(startOf(node), ...node.children.map(contentEnd));
    }
    return endOf(node);
  };
  const tableRowRange = (node: Nodes): SourceRange => {
    const raw = source.slice(startOf(node), endOf(node));
    const end = endOf(node) - (/[ \t]*\|?[ \t]*$/.exec(raw)?.[0].length ?? 0);
    return range(startOf(node), end);
  };
  const walk = (node: Nodes, ancestors: Nodes[]): void => {
    const start = startOf(node);
    const end = endOf(node);
    const raw = source.slice(start, end);
    switch (node.type) {
      case 'heading': {
        const title = textOf(node);
        const base = slugify(title);
        const count = (usedIds.get(base) ?? 0) + 1;
        usedIds.set(base, count);
        const firstLine = raw.split('\n')[0] ?? '';
        const content = /^#{1,6}(?:\s|$)/.test(firstLine)
          ? firstLine.replace(/[ \t]+#+[ \t]*$/, '').trimEnd()
          : firstLine.trimEnd();
        const heading: Heading = {
          level: node.depth,
          title,
          id: count === 1 ? base : `${base}-${count}`,
          range: range(start, start + content.length),
        };
        current = heading;
        headings.push({ node, heading, start, end: start + content.length });
        analysis.headings.push(heading);
        if (node.depth === 1 && !analysis.title) analysis.title = title;
        node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: heading.id } };
        break;
      }
      case 'link':
      case 'image':
      case 'linkReference':
      case 'imageReference': {
        const image = node.type === 'image' || node.type === 'imageReference';
        const automatic = !image && !raw.startsWith('[');
        const definition =
          'identifier' in node
            ? tree.children.find(
                (child) => child.type === 'definition' && child.identifier === node.identifier,
              )
            : undefined;
        const destination =
          'url' in node
            ? automatic
              ? node.url
              : (destinationToken(raw) ?? node.url)
            : definition?.type === 'definition'
              ? (destinationToken(source.slice(startOf(definition), endOf(definition)), true) ??
                definition.url)
              : '';
        const title =
          'title' in node
            ? (node.title ?? '')
            : definition?.type === 'definition'
              ? (definition.title ?? '')
              : '';
        const labelEnd = image ? start + Math.max(0, raw.search(/(?<!\\)\]/)) : contentEnd(node);
        analysis.links.push({
          image,
          label: textOf(node),
          destination,
          title,
          automatic,
          range: automatic ? range(0, 0) : range(start, labelEnd),
        });
        if (image) return;
        break;
      }
      case 'list':
        if (node.ordered) analysis.orderedLists.push(range(start, end));
        break;
      case 'listItem': {
        const parent = ancestors.at(-1);
        const itemRange = range(start, listItemEnd(source, node, start, end));
        const text = textOf(node);
        analysis.listItems.push({
          text,
          ordered: parent?.type === 'list' && !!parent.ordered,
          range: itemRange,
        });
        if (node.checked !== undefined && node.checked !== null)
          analysis.tasks.push({
            completed: node.checked,
            text,
            headingId: current?.id ?? '',
            headingTitle: current?.title ?? '',
            indent: ancestors.filter((ancestor) => ancestor.type === 'listItem').length,
            range: itemRange,
          });
        break;
      }
      case 'code': {
        const opening = /^(\x60{3,}|~{3,})(.*)/.exec(raw);
        const fenced = !!opening;
        const info = fenced ? (opening[2] ?? '').trim() : '';
        const lines = raw.split('\n');
        const marker = opening?.[1] ?? '';
        const closing =
          fenced &&
          lines.length > 1 &&
          new RegExp(`^ {0,3}${marker[0] === '~' ? '~' : '\x60'}{${marker.length},}[ \\t]*$`).test(
            lines.at(-1) ?? '',
          );
        const contentStop = closing
          ? start + raw.lastIndexOf('\n') + 1
          : end + (source[end] === '\n' ? 1 : 0);
        const body =
          fenced && closing ? raw.slice(raw.indexOf('\n') + 1, raw.lastIndexOf('\n') + 1) : '';
        const codeRange =
          fenced && !info && !node.value && body.length === 0
            ? range(0, 0)
            : range(start + (fenced ? 0 : 4), contentStop);
        const closed = !fenced || closing;
        analysis.codeBlocks.push({ info, source: node.value, fenced, closed, range: codeRange });
        if (info.toLowerCase() === 'mermaid')
          analysis.mermaidBlocks.push({ source: node.value, range: codeRange });
        if (!closed)
          analysis.diagnostics.push({
            severity: 'error',
            code: 'unclosed-fence',
            message: 'Fenced code block is not closed.',
            range: codeRange,
          });
        return;
      }
      case 'html':
        analysis.diagnostics.push({
          severity: 'error',
          code: 'forbidden-raw-html',
          message: 'Raw HTML is forbidden.',
          range: range(
            start,
            end + (ancestors.at(-1)?.type !== 'paragraph' && source[end] === '\n' ? 1 : 0),
          ),
        });
        return;
      case 'table': {
        const table: Table = {
          headers: node.children[0]?.children.map(textOf) ?? [],
          rows: node.children
            .slice(1)
            .map((row) => ({ cells: row.children.map(textOf), range: tableRowRange(row) })),
          alignments: (node.align ?? []).map((value) => value ?? 'none'),
          kind: '',
          columns: [],
          range: {
            start: positions.positionAt(start),
            end: tableRowRange(node.children.at(-1) ?? node).end,
          },
        };
        tables.push({ table, start });
        analysis.tables.push(table);
        break;
      }
    }
    if ('children' in node) for (const child of node.children) walk(child, [...ancestors, node]);
  };
  walk(tree, []);
  const usedAnnotations = new Set<number>();
  const firstH1 = headings.find((item) => item.heading.level === 1)?.start ?? source.length;
  for (const annotation of annotations) {
    if (annotation.kind === 'metadata' && annotation.start < firstH1) {
      analysis.metadata.push(...annotation.metadata);
      analysis.metadataBlocks++;
      usedAnnotations.add(annotation.start);
    }
  }
  const stack: Section[] = [];
  for (const [index, item] of headings.entries()) {
    if (item.heading.level === 1) continue;
    const end =
      headings.slice(index + 1).find((next) => next.heading.level <= item.heading.level)?.start ??
      source.length;
    const section: Section = {
      heading: item.heading,
      kind: '',
      metadata: [],
      tasks: analysis.tasks.filter(
        (task) =>
          task.range.start.offset >= item.heading.range.start.offset &&
          task.range.end.offset <= positions.utf8ByteOffset(end),
      ),
      text: tree.children
        .filter((node) => startOf(node) > item.start && startOf(node) < end)
        .map(textOf)
        .filter(Boolean)
        .join(' '),
      markdown: parsed.slice(item.end, end).trim(),
      range: range(item.start, end),
      children: [],
    };
    for (const annotation of annotations) {
      if (
        annotation.kind === 'section' &&
        annotation.end <= item.start &&
        parsed.slice(annotation.end, item.start).trim() === ''
      ) {
        section.kind = annotation.name;
        usedAnnotations.add(annotation.start);
        for (const metadata of annotations) {
          if (
            metadata.kind === 'metadata' &&
            metadata.start > annotation.end &&
            metadata.end < item.start
          ) {
            section.metadata.push(...metadata.metadata);
            usedAnnotations.add(metadata.start);
          }
        }
      }
    }
    const seen = new Set<string>();
    for (const metadata of section.metadata) {
      if (seen.has(metadata.key))
        analysis.diagnostics.push({
          severity: 'error',
          code: 'duplicate-toudocu-metadata',
          message: `Semantic field ${metadata.key} is declared more than once.`,
          range: metadata.range,
        });
      seen.add(metadata.key);
    }
    while (stack.length && (stack.at(-1)?.heading.level ?? 0) >= item.heading.level) stack.pop();
    (stack.at(-1)?.children ?? analysis.sections).push(section);
    stack.push(section);
  }
  for (const { table, start } of tables) {
    for (const annotation of annotations) {
      if (
        annotation.kind === 'table' &&
        annotation.end <= start &&
        parsed.slice(annotation.end, start).trim() === ''
      ) {
        table.kind = annotation.name;
        table.columns = annotation.columns;
        usedAnnotations.add(annotation.start);
      }
    }
  }
  for (const annotation of annotations) {
    if (!usedAnnotations.has(annotation.start))
      analysis.diagnostics.push({
        severity: 'error',
        code:
          annotation.kind === 'section' ? 'orphan-section-marker' : 'invalid-toudocu-annotation',
        message:
          annotation.kind === 'section'
            ? 'Toudocu section marker must immediately precede a heading.'
            : 'Toudocu annotation is not attached to a supported element.',
        range: annotation.range,
      });
  }
  const firstHeading = tree.children.findIndex(
    (node) => node.type === 'heading' && node.depth === 1,
  );
  const afterTitle = firstHeading >= 0 ? tree.children[firstHeading + 1] : undefined;
  analysis.description = afterTitle?.type === 'paragraph' ? textOf(afterTitle) : '';
  analysis.plainText = textOf(tree);
  const firstLine = source.slice(0, source.indexOf('\n')).trim();
  if (firstLine === '---' || firstLine === '+++') {
    const closing = new RegExp(`^${firstLine.replaceAll('+', '\\+')}[ \\t]*$`, 'gm');
    closing.lastIndex = source.indexOf('\n') + 1;
    const match = closing.exec(source);
    if (match)
      analysis.diagnostics.push({
        severity: 'error',
        code: 'forbidden-front-matter',
        message: 'Front matter is forbidden.',
        range: range(0, match.index + match[0].length),
      });
  }
  return {
    source,
    sourcePath,
    analysis,
    render: (options = {}) => renderMarkdown(tree, analysis, source, options),
  };
}
