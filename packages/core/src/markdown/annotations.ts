import type { Diagnostic, MetadataItem } from './model.js';
import { SourcePositionMapper, type SourceRange } from './source-position.js';

export interface Annotation {
  kind: 'metadata' | 'section' | 'table';
  name: string;
  columns: string[];
  metadata: MetadataItem[];
  start: number;
  end: number;
  range: SourceRange;
}

const canonicalName = /^[a-z][a-z0-9-]*$/;
const canonicalField = /^[a-z][a-zA-Z0-9]*$/;

/** Blank only exact reserved annotations, preserving parser source positions. */
export function extractAnnotations(
  source: string,
  positions: SourcePositionMapper,
): {
  parsed: string;
  annotations: Annotation[];
  diagnostics: Diagnostic[];
} {
  const annotations: Annotation[] = [];
  const diagnostics: Diagnostic[] = [];
  const pieces: string[] = [];
  let copiedUntil = 0;
  let fence = '';
  let fenceSize = 0;
  const blank = (start: number, end: number): void => {
    pieces.push(source.slice(copiedUntil, start), source.slice(start, end).replace(/[^\n]/g, ' '));
    copiedUntil = end;
  };
  for (let offset = 0; offset < source.length;) {
    const newline = source.indexOf('\n', offset);
    const lineEnd = newline < 0 ? source.length : newline;
    const line = source.slice(offset, lineEnd);
    const indent = /^[ \t]*/.exec(line)?.[0].length ?? 0;
    const text = line.slice(indent);
    const marker = /^(\x60{3,}|~{3,})/.exec(text)?.[0];
    if (marker && indent <= 3) {
      if (!fence) {
        fence = marker[0] ?? '';
        fenceSize = marker.length;
      } else if (
        marker[0] === fence &&
        marker.length >= fenceSize &&
        text.slice(marker.length).trim() === ''
      )
        fence = '';
      offset = lineEnd + 1;
      continue;
    }
    if (fence) {
      offset = lineEnd + 1;
      continue;
    }
    const start = offset + indent;
    let end = lineEnd;
    let candidate: Annotation | undefined;
    let message = '';
    if (text.startsWith('<!-- toudocu:')) {
      const fields = text.trim().replace(/^<!--/, '').replace(/-->$/, '').trim().split(/\s+/);
      const name = fields[1] ?? '';
      if (text.trimEnd().endsWith('-->') && canonicalName.test(name)) {
        if (fields.length === 2 && fields[0] === 'toudocu:section') {
          candidate = {
            kind: 'section',
            name,
            columns: [],
            metadata: [],
            start,
            end,
            range: { start: positions.positionAt(start), end: positions.positionAt(end) },
          };
        } else if (
          fields.length === 3 &&
          fields[0] === 'toudocu:table' &&
          fields[2]?.startsWith('columns=')
        ) {
          const columns = fields[2].slice(8).split(',');
          if (columns.every((column) => canonicalField.test(column))) {
            candidate = {
              kind: 'table',
              name,
              columns,
              metadata: [],
              start,
              end,
              range: { start: positions.positionAt(start), end: positions.positionAt(end) },
            };
          }
        }
      }
      message = 'Invalid Toudocu annotation.';
    } else if (/^<!-- toudocu(?:$|[ \t])/.test(text)) {
      const closing = source.indexOf('-->', start);
      end = closing < 0 ? source.length : closing + 3;
      message =
        closing < 0
          ? 'Toudocu metadata annotation is not closed.'
          : 'Invalid Toudocu metadata annotation.';
      if (closing >= 0) {
        const body = source.slice(start + '<!-- toudocu'.length, closing);
        const metadata: MetadataItem[] = [];
        let valid = body.trim() !== '';
        for (const [index, rawLine] of body.split('\n').entries()) {
          const valueLine = rawLine.trim();
          if (!valueLine) continue;
          const colon = valueLine.indexOf(':');
          const key = valueLine.slice(0, colon).trim();
          const value = valueLine.slice(colon + 1).trim();
          if (colon < 0 || !canonicalField.test(key) || !value) {
            valid = false;
            break;
          }
          const lineNumber = positions.positionAt(start).line + index;
          const byteLength = new SourcePositionMapper(valueLine).utf8ByteOffset(valueLine.length);
          // Legacy metadata ranges carry line/column but no absolute offsets.
          metadata.push({
            key,
            rawKey: key,
            value,
            range: {
              start: { offset: 0, line: lineNumber, column: 1 },
              end: { offset: 0, line: lineNumber, column: byteLength + 1 },
            },
          });
        }
        if (valid && metadata.length > 0)
          candidate = {
            kind: 'metadata',
            name: '',
            columns: [],
            metadata,
            start,
            end,
            range: { start: positions.positionAt(start), end: positions.positionAt(end) },
          };
      }
    } else {
      offset = lineEnd + 1;
      continue;
    }
    blank(start, end);
    if (candidate) annotations.push(candidate);
    else
      diagnostics.push({
        severity: 'error',
        code: 'invalid-toudocu-annotation',
        message,
        range: { start: positions.positionAt(start), end: positions.positionAt(end) },
      });
    offset = Math.max(end, lineEnd + 1);
  }
  pieces.push(source.slice(copiedUntil));
  return { parsed: pieces.join(''), annotations, diagnostics };
}
