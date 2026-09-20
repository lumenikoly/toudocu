/** A source location using the legacy Toudocu byte based contract. */
export interface Position {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

/** A parser location whose offset and column count UTF-16 code units. */
export interface Utf16Position {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

export interface Utf16Range {
  readonly start: Utf16Position;
  readonly end: Utf16Position;
}

type LineStart = {
  readonly utf16Offset: number;
  readonly byteOffset: number;
};

function utf8ByteLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/**
 * Converts parser UTF-16 offsets to the UTF-8 byte offsets used by Go.
 * Offsets inside a surrogate pair point at the pair's first byte.
 */
export class SourcePositionMapper {
  private readonly byteOffsets: readonly number[];
  private readonly lineStarts: readonly LineStart[];

  public constructor(private readonly source: string) {
    const byteOffsets = new Array<number>(source.length + 1);
    let utf16Offset = 0;
    let byteOffset = 0;

    byteOffsets[0] = 0;
    while (utf16Offset < source.length) {
      const codePoint = source.codePointAt(utf16Offset);
      if (codePoint === undefined) {
        break;
      }
      const utf16Length = codePoint > 0xffff ? 2 : 1;
      const byteLength = utf8ByteLength(codePoint);
      for (let i = 0; i < utf16Length; i += 1) {
        byteOffsets[utf16Offset + i] = byteOffset;
      }
      utf16Offset += utf16Length;
      byteOffset += byteLength;
      byteOffsets[utf16Offset] = byteOffset;
    }

    const lineStarts: LineStart[] = [{ utf16Offset: 0, byteOffset: 0 }];
    for (let i = 0; i < source.length;) {
      const codeUnit = source.charCodeAt(i);
      if (codeUnit === 10) {
        i += 1;
        lineStarts.push({ utf16Offset: i, byteOffset: byteOffsets[i] ?? byteOffset });
      } else {
        i += 1;
      }
    }

    this.byteOffsets = byteOffsets;
    this.lineStarts = lineStarts;
  }

  /** Return the UTF-8 byte offset for a UTF-16 code-unit offset. */
  public utf8ByteOffset(utf16Offset: number): number {
    const offset = this.clampUtf16Offset(utf16Offset);
    return this.byteOffsets[offset] ?? this.byteOffsets[this.byteOffsets.length - 1] ?? 0;
  }

  /** Return the legacy byte based position at a UTF-16 code-unit offset. */
  public positionAt(utf16Offset: number): Position {
    const offset = this.clampUtf16Offset(utf16Offset);
    const byteOffset = this.utf8ByteOffset(offset);
    let low = 0;
    let high = this.lineStarts.length;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      const lineStart = this.lineStarts[middle];
      if (lineStart !== undefined && lineStart.utf16Offset <= offset) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const lineStart = this.lineStarts[low] ?? { utf16Offset: 0, byteOffset: 0 };
    return {
      offset: byteOffset,
      line: low + 1,
      column: byteOffset - lineStart.byteOffset + 1,
    };
  }

  /** Map an mdast-style UTF-16 location to the legacy position. */
  public position(position: Utf16Position): Position {
    const offset =
      position.offset === undefined
        ? this.offsetForLineColumn(position.line, position.column)
        : position.offset;
    return this.positionAt(offset);
  }

  public range(range: Utf16Range): SourceRange {
    return { start: this.position(range.start), end: this.position(range.end) };
  }

  private clampUtf16Offset(offset: number): number {
    if (!Number.isFinite(offset)) {
      return 0;
    }
    return Math.min(this.source.length, Math.max(0, Math.trunc(offset)));
  }

  private offsetForLineColumn(line: number, column: number): number {
    if (!Number.isInteger(line) || line < 1 || line > this.lineStarts.length) {
      throw new RangeError(`line must be between 1 and ${this.lineStarts.length}`);
    }
    if (!Number.isInteger(column) || column < 1) {
      throw new RangeError('column must be at least 1');
    }
    const lineStart = this.lineStarts[line - 1];
    if (lineStart === undefined) {
      return this.source.length;
    }
    const lineEnd = this.lineStarts[line] ?? { utf16Offset: this.source.length };
    return Math.min(this.source.length, lineStart.utf16Offset + column - 1, lineEnd.utf16Offset);
  }
}

export function utf16ToUtf8ByteOffset(source: string, utf16Offset: number): number {
  return new SourcePositionMapper(source).utf8ByteOffset(utf16Offset);
}

export const utf16ToUtf8Offset = utf16ToUtf8ByteOffset;

export function mapSourcePosition(source: string, position: Utf16Position): Position {
  return new SourcePositionMapper(source).position(position);
}

export function mapSourceRange(source: string, range: Utf16Range): SourceRange {
  return new SourcePositionMapper(source).range(range);
}
