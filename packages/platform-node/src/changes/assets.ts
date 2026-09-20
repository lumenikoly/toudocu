import type { ChangeSetReportV1 } from '@toudocu/contracts';
import { crc32 } from 'node:zlib';
import { SaxesParser, type SaxesTagNS } from 'saxes';

type Change = ChangeSetReportV1['changes'][number];
export type AssetMetadata = NonNullable<NonNullable<Change['asset']>['before']>;
export type AssetDiffMetadata = NonNullable<Change['asset']>;

const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const utf8Fatal = new TextDecoder('utf-8', { fatal: true });
const embeddedOpenTypePattern = new Uint8Array(36);
embeddedOpenTypePattern.set([0x4c, 0x50], 34);
const embeddedOpenTypeMask = new Uint8Array(36);
embeddedOpenTypeMask.set([0xff, 0xff], 34);

type SniffSignature =
  | {
      kind: 'exact';
      pattern: Uint8Array;
      mediaType: string;
    }
  | {
      kind: 'masked';
      pattern: Uint8Array;
      mask: Uint8Array;
      mediaType: string;
      skipWhitespace?: boolean;
    }
  | {
      kind: 'html';
      pattern: string;
      mediaType: string;
    };

const sniffSignatures: SniffSignature[] = [
  ...[
    '<!DOCTYPE HTML',
    '<HTML',
    '<HEAD',
    '<SCRIPT',
    '<IFRAME',
    '<H1',
    '<DIV',
    '<FONT',
    '<TABLE',
    '<A',
    '<STYLE',
    '<TITLE',
    '<B',
    '<BODY',
    '<BR',
    '<P',
    '<!--',
  ].map((pattern) => ({
    kind: 'html' as const,
    pattern,
    mediaType: 'text/html; charset=utf-8',
  })),
  {
    kind: 'masked',
    pattern: new TextEncoder().encode('<?xml'),
    mask: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]),
    skipWhitespace: true,
    mediaType: 'text/xml; charset=utf-8',
  },
  exactSignature('%PDF-', 'application/pdf'),
  exactSignature('%!PS-Adobe-', 'application/postscript'),
  {
    kind: 'masked',
    pattern: new Uint8Array([0xfe, 0xff, 0x00, 0x00]),
    mask: new Uint8Array([0xff, 0xff, 0x00, 0x00]),
    mediaType: 'text/plain; charset=utf-16be',
  },
  {
    kind: 'masked',
    pattern: new Uint8Array([0xff, 0xfe, 0x00, 0x00]),
    mask: new Uint8Array([0xff, 0xff, 0x00, 0x00]),
    mediaType: 'text/plain; charset=utf-16le',
  },
  {
    kind: 'masked',
    pattern: new Uint8Array([0xef, 0xbb, 0xbf, 0x00]),
    mask: new Uint8Array([0xff, 0xff, 0xff, 0x00]),
    mediaType: 'text/plain; charset=utf-8',
  },
  exactBytes([0x00, 0x00, 0x01, 0x00], 'image/x-icon'),
  exactBytes([0x00, 0x00, 0x02, 0x00], 'image/x-icon'),
  exactSignature('BM', 'image/bmp'),
  exactSignature('GIF87a', 'image/gif'),
  exactSignature('GIF89a', 'image/gif'),
  maskedBytes(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50],
    [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    'image/webp',
  ),
  exactBytes([...pngSignature], 'image/png'),
  exactBytes([0xff, 0xd8, 0xff], 'image/jpeg'),
  maskedBytes(
    [0x46, 0x4f, 0x52, 0x4d, 0, 0, 0, 0, 0x41, 0x49, 0x46, 0x46],
    [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff],
    'audio/aiff',
  ),
  maskedBytes([0x49, 0x44, 0x33], [0xff, 0xff, 0xff], 'audio/mpeg'),
  maskedBytes([0x4f, 0x67, 0x67, 0x53, 0x00], [0xff, 0xff, 0xff, 0xff, 0xff], 'application/ogg'),
  maskedBytes(
    [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 0x06],
    [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    'audio/midi',
  ),
  maskedBytes(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20],
    [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff],
    'video/avi',
  ),
  maskedBytes(
    [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45],
    [0xff, 0xff, 0xff, 0xff, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xff],
    'audio/wave',
  ),
  exactBytes([0x1a, 0x45, 0xdf, 0xa3], 'video/webm'),
  maskedBytes(embeddedOpenTypePattern, embeddedOpenTypeMask, 'application/vnd.ms-fontobject'),
  exactBytes([0x00, 0x01, 0x00, 0x00], 'font/ttf'),
  exactSignature('OTTO', 'font/otf'),
  exactSignature('ttcf', 'font/collection'),
  exactSignature('wOFF', 'font/woff'),
  exactSignature('wOF2', 'font/woff2'),
  exactBytes([0x1f, 0x8b, 0x08], 'application/x-gzip'),
  exactBytes([0x50, 0x4b, 0x03, 0x04], 'application/zip'),
  exactSignature('Rar!\x1a\x07\x00', 'application/x-rar-compressed'),
  exactSignature('Rar!\x1a\x07\x01\x00', 'application/x-rar-compressed'),
  exactBytes([0x00, 0x61, 0x73, 0x6d], 'application/wasm'),
];

function exactSignature(pattern: string, mediaType: string): SniffSignature {
  return {
    kind: 'exact',
    pattern: new TextEncoder().encode(pattern),
    mediaType,
  };
}

function exactBytes(pattern: number[], mediaType: string): SniffSignature {
  return {
    kind: 'exact',
    pattern: new Uint8Array(pattern),
    mediaType,
  };
}

function maskedBytes(
  pattern: number[] | Uint8Array,
  mask: number[] | Uint8Array,
  mediaType: string,
): SniffSignature {
  return {
    kind: 'masked',
    pattern: new Uint8Array(pattern),
    mask: new Uint8Array(mask),
    mediaType,
  };
}

export function buildAssetDiffMetadata(
  before: Uint8Array,
  after: Uint8Array,
  status: string,
): AssetDiffMetadata {
  const result: AssetDiffMetadata = {};
  if (status !== 'added' && status !== 'untracked' && before.byteLength > 0) {
    result.before = inspectAsset(before);
  }
  if (status !== 'deleted' && after.byteLength > 0) {
    result.after = inspectAsset(after);
  }
  return result;
}

export function inspectAsset(content: Uint8Array): AssetMetadata {
  let mediaType = detectContentType(content);
  let width = 0;
  let height = 0;

  if (hasPrefix(content, pngSignature)) {
    mediaType = 'image/png';
  }

  if (mediaType.includes('svg') || containsAscii(content, '<svg', 512)) {
    mediaType = 'image/svg+xml';
    ({ width, height } = svgDimensions(content));
  } else {
    const webP = webPDimensions(content);
    if (webP.ok) {
      mediaType = 'image/webp';
      width = webP.width;
      height = webP.height;
    } else if (hasPrefix(content, pngSignature)) {
      ({ width, height } = pngDimensions(content));
    } else if (mediaType === 'image/jpeg') {
      ({ width, height } = jpegDimensions(content));
    }
  }

  const result: AssetMetadata = { mediaType };
  if (width !== 0) {
    result.width = width;
  }
  if (height !== 0) {
    result.height = height;
  }
  if (width > 0 && height > 0) {
    result.aspectRatio = Math.round((width / height) * 10000) / 10000;
  }

  if (content.byteLength > 25 && hasPrefix(content, pngSignature)) {
    result.transparency = content[25] === 4 || content[25] === 6;
  } else if (mediaType === 'image/jpeg') {
    result.transparency = false;
  } else if (
    mediaType === 'image/webp' &&
    content.byteLength >= 21 &&
    ascii(content, 12, 4) === 'VP8X'
  ) {
    result.transparency = (content[20] ?? 0) & 0x10 ? true : false;
  }
  return result;
}

function detectContentType(content: Uint8Array): string {
  const sniff = content.subarray(0, Math.min(content.byteLength, 512));
  const firstNonWhitespace = firstSniffByte(sniff);
  for (const signature of sniffSignatures) {
    const mediaType = matchSniffSignature(signature, sniff, firstNonWhitespace);
    if (mediaType) {
      return mediaType;
    }
  }
  if (isMp4(sniff)) {
    return 'video/mp4';
  }
  if (isUtf8Text(sniff.subarray(firstNonWhitespace))) {
    return 'text/plain; charset=utf-8';
  }
  return 'application/octet-stream';
}

function matchSniffSignature(
  signature: SniffSignature,
  content: Uint8Array,
  firstNonWhitespace: number,
): string {
  if (signature.kind === 'html') {
    if (!asciiEqualFold(content, firstNonWhitespace, signature.pattern)) {
      return '';
    }
    const next = content[firstNonWhitespace + signature.pattern.length] ?? 0;
    return next === 0x20 || next === 0x3e ? signature.mediaType : '';
  }
  const data =
    signature.kind === 'masked' && signature.skipWhitespace
      ? content.subarray(firstNonWhitespace)
      : content;
  if (data.byteLength < signature.pattern.byteLength) {
    return '';
  }
  if (signature.kind === 'exact') {
    return hasPrefix(data, signature.pattern) ? signature.mediaType : '';
  }
  if (signature.mask.byteLength !== signature.pattern.byteLength) {
    return '';
  }
  for (let index = 0; index < signature.pattern.length; index++) {
    if (((data[index] ?? 0) & (signature.mask[index] ?? 0)) !== (signature.pattern[index] ?? 0)) {
      return '';
    }
  }
  return signature.mediaType;
}

function isMp4(content: Uint8Array): boolean {
  if (content.byteLength < 12 || ascii(content, 4, 4) !== 'ftyp') {
    return false;
  }
  const boxSize = readUint32BE(content, 0);
  if (boxSize % 4 !== 0 || content.byteLength < boxSize) {
    return false;
  }
  for (let offset = 8; offset < boxSize; offset += 4) {
    if (offset === 12) {
      continue;
    }
    if (ascii(content, offset, 3) === 'mp4') {
      return true;
    }
  }
  return false;
}

function firstSniffByte(content: Uint8Array): number {
  let offset = 0;
  while (offset < content.length && isMimeWhitespace(content[offset] ?? 0)) {
    offset++;
  }
  return offset;
}

function isMimeWhitespace(value: number): boolean {
  return value === 0x09 || value === 0x0a || value === 0x0c || value === 0x0d || value === 0x20;
}

function asciiEqualFold(content: Uint8Array, offset: number, text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const expected = text.charCodeAt(index);
    const actual = content[offset + index] ?? 0;
    if (expected >= 0x41 && expected <= 0x5a) {
      if (actual !== expected && actual !== expected + 0x20) {
        return false;
      }
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

function isUtf8Text(content: Uint8Array): boolean {
  for (const value of content) {
    if (
      value <= 0x08 ||
      value === 0x0b ||
      (value >= 0x0e && value <= 0x1a) ||
      (value >= 0x1c && value <= 0x1f)
    ) {
      return false;
    }
  }
  return true;
}

function pngDimensions(content: Uint8Array): { width: number; height: number } {
  if (
    content.byteLength < 33 ||
    readUint32BE(content, 8) !== 13 ||
    ascii(content, 12, 4) !== 'IHDR' ||
    crc32(content.subarray(12, 29)) !== readUint32BE(content, 29)
  ) {
    return { width: 0, height: 0 };
  }
  const depth = content[24] ?? 0;
  const colorType = content[25] ?? 0;
  const compression = content[26] ?? 0;
  const filter = content[27] ?? 0;
  const interlace = content[28] ?? 0;
  if (
    readUint32BE(content, 16) === 0 ||
    readUint32BE(content, 20) === 0 ||
    readUint32BE(content, 16) > 0x7fffffff ||
    readUint32BE(content, 20) > 0x7fffffff ||
    compression !== 0 ||
    filter !== 0 ||
    (interlace !== 0 && interlace !== 1) ||
    !validPngColor(depth, colorType)
  ) {
    return { width: 0, height: 0 };
  }
  return {
    width: readUint32BE(content, 16),
    height: readUint32BE(content, 20),
  };
}

function validPngColor(depth: number, colorType: number): boolean {
  if (depth === 1 || depth === 2 || depth === 4) {
    return colorType === 0 || colorType === 3;
  }
  if (depth === 8) {
    return (
      colorType === 0 || colorType === 2 || colorType === 3 || colorType === 4 || colorType === 6
    );
  }
  if (depth === 16) {
    return colorType === 0 || colorType === 2 || colorType === 4 || colorType === 6;
  }
  return false;
}

function jpegDimensions(content: Uint8Array): { width: number; height: number } {
  let offset = 2;
  let frame: { width: number; height: number } | undefined;
  let jfif = false;
  while (offset + 3 < content.byteLength) {
    if (content[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (content[offset] === 0xff) {
      offset++;
    }
    const marker = content[offset++] ?? 0;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      continue;
    }
    if (offset + 1 >= content.byteLength) {
      return { width: 0, height: 0 };
    }
    const length = readUint16BE(content, offset);
    if (length < 2 || offset + length > content.byteLength) {
      return { width: 0, height: 0 };
    }
    if (marker === 0xe0 && length >= 7 && ascii(content, offset + 2, 5) === 'JFIF\x00') {
      jfif = true;
    }
    if (isJpegFrame(marker) && length >= 7) {
      frame = jpegFrameDimensions(content, offset, length);
      if (frame === undefined) {
        return { width: 0, height: 0 };
      }
      if (jfif) {
        return frame;
      }
    }
    if (marker === 0xda) {
      return frame ?? { width: 0, height: 0 };
    }
    offset += length;
  }
  return { width: 0, height: 0 };
}

function jpegFrameDimensions(
  content: Uint8Array,
  offset: number,
  length: number,
): { width: number; height: number } | undefined {
  const components = (length - 2 - 6) / 3;
  if (components !== 1 && components !== 3 && components !== 4) {
    return undefined;
  }
  if (content[offset + 2] !== 8 || content[offset + 7] !== components) {
    return undefined;
  }
  const identifiers = new Set<number>();
  for (let index = 0; index < components; index++) {
    const componentOffset = offset + 8 + index * 3;
    const identifier = content[componentOffset] ?? 0;
    const sampling = content[componentOffset + 1] ?? 0;
    const horizontal = sampling >> 4;
    const vertical = sampling & 0x0f;
    const quantization = content[componentOffset + 2] ?? 0;
    if (
      identifiers.has(identifier) ||
      horizontal < 1 ||
      horizontal > 4 ||
      vertical < 1 ||
      vertical > 4 ||
      horizontal === 3 ||
      vertical === 3 ||
      quantization > 3
    ) {
      return undefined;
    }
    identifiers.add(identifier);
  }
  return {
    width: readUint16BE(content, offset + 5),
    height: readUint16BE(content, offset + 3),
  };
}

function isJpegFrame(marker: number): boolean {
  return marker === 0xc0 || marker === 0xc1 || marker === 0xc2;
}

function webPDimensions(content: Uint8Array): {
  width: number;
  height: number;
  ok: boolean;
} {
  if (
    content.byteLength < 30 ||
    ascii(content, 0, 4) !== 'RIFF' ||
    ascii(content, 8, 4) !== 'WEBP'
  ) {
    return { width: 0, height: 0, ok: false };
  }
  const chunk = ascii(content, 12, 4);
  if (chunk === 'VP8X') {
    return {
      width: 1 + (content[24] ?? 0) + ((content[25] ?? 0) << 8) + ((content[26] ?? 0) << 16),
      height: 1 + (content[27] ?? 0) + ((content[28] ?? 0) << 8) + ((content[29] ?? 0) << 16),
      ok: true,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: readUint16LE(content, 26) & 0x3fff,
      height: readUint16LE(content, 28) & 0x3fff,
      ok: true,
    };
  }
  if (chunk === 'VP8L' && content[20] === 0x2f && content.byteLength >= 25) {
    const bits = readUint32LE(content, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, ok: true };
  }
  return { width: 0, height: 0, ok: true };
}

function svgDimensions(content: Uint8Array): { width: number; height: number } {
  let source: string;
  try {
    source = utf8Fatal.decode(content);
  } catch {
    return { width: 0, height: 0 };
  }
  let dimensions: { width: number; height: number } | undefined;
  const stop = {};
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag: SaxesTagNS) => {
    const localName = tag.local.toLowerCase();
    if (localName !== 'svg') {
      return;
    }
    const attributes = new Map<string, string>();
    for (const attribute of Object.values(tag.attributes)) {
      attributes.set(attribute.local.toLowerCase(), attribute.value);
    }
    const width = svgLength(attributes.get('width') ?? '');
    const height = svgLength(attributes.get('height') ?? '');
    let resolvedWidth = width;
    let resolvedHeight = height;
    const viewBox = attributes.get('viewbox') ?? '';
    if ((resolvedWidth === 0 || resolvedHeight === 0) && viewBox) {
      const parts = viewBox.replaceAll(',', ' ').trim().split(/\s+/u);
      if (parts.length === 4) {
        resolvedWidth = roundGo(parseSvgNumber(parts[2] ?? ''));
        resolvedHeight = roundGo(parseSvgNumber(parts[3] ?? ''));
      }
    }
    dimensions = { width: resolvedWidth, height: resolvedHeight };
    throw stop;
  });
  try {
    parser.write(source).close();
  } catch (error: unknown) {
    if (error !== stop) {
      return { width: 0, height: 0 };
    }
  }
  return dimensions ?? { width: 0, height: 0 };
}

function svgLength(value: string): number {
  const trimmed = value.trim();
  let end = 0;
  while (
    end < trimmed.length &&
    (trimmed[end] === '.' || trimmed[end] === '-' || isDigit(trimmed[end] ?? ''))
  ) {
    end++;
  }
  return roundGo(Number.parseFloat(trimmed.slice(0, end)));
}

function isDigit(value: string): boolean {
  return value >= '0' && value <= '9';
}

function parseSvgNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundGo(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

function containsAscii(content: Uint8Array, text: string, limit: number): boolean {
  const bytes = new TextEncoder().encode(text);
  const end = Math.min(content.byteLength, limit);
  for (let offset = 0; offset + bytes.length <= end; offset++) {
    let matched = true;
    for (let index = 0; index < bytes.length; index++) {
      if (content[offset + index] !== bytes[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return true;
    }
  }
  return false;
}

function hasPrefix(content: Uint8Array, prefix: Uint8Array): boolean {
  if (content.byteLength < prefix.byteLength) {
    return false;
  }
  for (let index = 0; index < prefix.length; index++) {
    if (content[index] !== prefix[index]) {
      return false;
    }
  }
  return true;
}

function ascii(content: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let index = 0; index < length; index++) {
    result += String.fromCharCode(content[offset + index] ?? 0);
  }
  return result;
}

function readUint16BE(content: Uint8Array, offset: number): number {
  return ((content[offset] ?? 0) << 8) | (content[offset + 1] ?? 0);
}

function readUint16LE(content: Uint8Array, offset: number): number {
  return (content[offset] ?? 0) | ((content[offset + 1] ?? 0) << 8);
}

function readUint32BE(content: Uint8Array, offset: number): number {
  return (
    (((content[offset] ?? 0) << 24) |
      ((content[offset + 1] ?? 0) << 16) |
      ((content[offset + 2] ?? 0) << 8) |
      (content[offset + 3] ?? 0)) >>>
    0
  );
}

function readUint32LE(content: Uint8Array, offset: number): number {
  return (
    ((content[offset] ?? 0) |
      ((content[offset + 1] ?? 0) << 8) |
      ((content[offset + 2] ?? 0) << 16) |
      ((content[offset + 3] ?? 0) << 24)) >>>
    0
  );
}
