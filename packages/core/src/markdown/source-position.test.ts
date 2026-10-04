import { describe, expect, it } from 'vitest';

import {
  SourcePositionMapper,
  mapSourcePosition,
  mapSourceRange,
  utf16ToUtf8ByteOffset,
} from './source-position.js';

describe('SourcePositionMapper', () => {
  it('maps Cyrillic and CJK UTF-16 offsets to UTF-8 bytes', () => {
    const source = 'я\n中文';
    expect(mapSourcePosition(source, { line: 2, column: 1, offset: 2 })).toEqual({
      offset: 3,
      line: 2,
      column: 1,
    });
    expect(mapSourcePosition(source, { line: 2, column: 2, offset: 3 })).toEqual({
      offset: 6,
      line: 2,
      column: 4,
    });
  });

  it('counts an emoji as two UTF-16 units and four UTF-8 bytes', () => {
    const mapper = new SourcePositionMapper('a😀b');
    expect(mapper.positionAt(1)).toEqual({ offset: 1, line: 1, column: 2 });
    expect(mapper.positionAt(3)).toEqual({ offset: 5, line: 1, column: 6 });
    expect(utf16ToUtf8ByteOffset('a😀b', 4)).toBe(6);
  });

  it('keeps combining marks as separate source positions', () => {
    const mapper = new SourcePositionMapper('e\u0301x');
    expect(mapper.positionAt(2)).toEqual({ offset: 3, line: 1, column: 4 });
    expect(mapper.positionAt(3)).toEqual({ offset: 4, line: 1, column: 5 });
  });

  it('treats CRLF as one line break while retaining both UTF-8 bytes', () => {
    const mapper = new SourcePositionMapper('я\r\n中');
    expect(mapper.positionAt(3)).toEqual({ offset: 4, line: 2, column: 1 });
    expect(mapper.positionAt(4)).toEqual({ offset: 7, line: 2, column: 4 });
    expect(mapper.positionAt(2)).toEqual({ offset: 3, line: 1, column: 4 });
  });

  it('uses LF as the line separator, matching the legacy line index', () => {
    expect(new SourcePositionMapper('a\rb').positionAt(2)).toEqual({
      offset: 2,
      line: 1,
      column: 3,
    });
  });

  it('handles LF and maps ranges from parser offsets', () => {
    const source = 'a\n😀';
    expect(
      mapSourceRange(source, {
        start: { line: 2, column: 1, offset: 2 },
        end: { line: 2, column: 3, offset: 4 },
      }),
    ).toEqual({
      start: { offset: 2, line: 2, column: 1 },
      end: { offset: 6, line: 2, column: 5 },
    });
  });

  it('converts a UTF-16 line and column when no offset is supplied', () => {
    expect(mapSourcePosition('я\n中', { line: 2, column: 1 })).toEqual({
      offset: 3,
      line: 2,
      column: 1,
    });
  });
});
