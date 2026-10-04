import { crc32 } from 'node:zlib';
import { expect, test } from 'vitest';
import { buildAssetDiffMetadata, inspectAsset } from './assets.js';

function pngFixture(width: number, height: number, colorType = 6): Uint8Array {
  const content = new Uint8Array(33);
  content.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  content.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  new DataView(content.buffer).setUint32(16, width);
  new DataView(content.buffer).setUint32(20, height);
  content[24] = 8;
  content[25] = colorType;
  new DataView(content.buffer).setUint32(29, crc32(content.subarray(12, 29)));
  return content;
}

function jpegFixture(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
    0xff,
    0xda,
    0x00,
    0x02,
  ]);
}

function webPFixture(
  width: number,
  height: number,
  transparent = true,
  chunk = 'VP8X',
): Uint8Array {
  const content = new Uint8Array(30);
  content.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  content.set(new TextEncoder().encode(chunk), 12);
  if (chunk === 'VP8L') {
    const bits = (width - 1) | ((height - 1) << 14);
    content[20] = 0x2f;
    new DataView(content.buffer).setUint32(21, bits, true);
    return content;
  }
  if (chunk === 'VP8 ') {
    new DataView(content.buffer).setUint16(26, width, true);
    new DataView(content.buffer).setUint16(28, height, true);
    return content;
  }
  content[20] = transparent ? 0x10 : 0;
  content[24] = (width - 1) & 0xff;
  content[25] = ((width - 1) >> 8) & 0xff;
  content[26] = ((width - 1) >> 16) & 0xff;
  content[27] = (height - 1) & 0xff;
  content[28] = ((height - 1) >> 8) & 0xff;
  content[29] = ((height - 1) >> 16) & 0xff;
  return content;
}

test('inspects PNG, JPEG, WebP, SVG, and invalid asset metadata', () => {
  expect(inspectAsset(pngFixture(320, 240))).toEqual({
    mediaType: 'image/png',
    width: 320,
    height: 240,
    aspectRatio: 1.3333,
    transparency: true,
  });
  expect(inspectAsset(jpegFixture(32, 16))).toEqual({
    mediaType: 'image/jpeg',
    width: 32,
    height: 16,
    aspectRatio: 2,
    transparency: false,
  });
  expect(inspectAsset(webPFixture(300, 200))).toEqual({
    mediaType: 'image/webp',
    width: 300,
    height: 200,
    aspectRatio: 1.5,
    transparency: true,
  });
  expect(inspectAsset(webPFixture(120, 80, false, 'VP8 '))).toEqual({
    mediaType: 'image/webp',
    width: 120,
    height: 80,
    aspectRatio: 1.5,
  });
  expect(inspectAsset(webPFixture(64, 32, false, 'VP8L'))).toEqual({
    mediaType: 'image/webp',
    width: 64,
    height: 32,
    aspectRatio: 2,
  });
  expect(
    inspectAsset(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="12.5px" height="8mm"/>',
      ),
    ),
  ).toEqual({
    mediaType: 'image/svg+xml',
    width: 13,
    height: 8,
    aspectRatio: 1.625,
  });
  expect(inspectAsset(new TextEncoder().encode('<svg viewBox="0,0,32,16"></svg>'))).toEqual({
    mediaType: 'image/svg+xml',
    width: 32,
    height: 16,
    aspectRatio: 2,
  });
  expect(inspectAsset(new TextEncoder().encode('<svg viewBox="0 0 10junk 20"></svg>'))).toEqual({
    mediaType: 'image/svg+xml',
    height: 20,
  });
  expect(inspectAsset(new TextEncoder().encode('<svg width="10">'))).toEqual({
    mediaType: 'image/svg+xml',
    width: 10,
  });
  const invalidPng = pngFixture(320, 240);
  invalidPng[29] = (invalidPng[29] ?? 0) ^ 0xff;
  expect(inspectAsset(invalidPng)).toEqual({
    mediaType: 'image/png',
    transparency: true,
  });
  const invalidPngFields = pngFixture(320, 240);
  invalidPngFields[26] = 1;
  new DataView(invalidPngFields.buffer).setUint32(29, crc32(invalidPngFields.subarray(12, 29)));
  expect(inspectAsset(invalidPngFields)).toEqual({
    mediaType: 'image/png',
    transparency: true,
  });
  const unsupportedJpeg = jpegFixture(32, 16);
  unsupportedJpeg[3] = 0xc3;
  expect(inspectAsset(unsupportedJpeg)).toEqual({
    mediaType: 'image/jpeg',
    transparency: false,
  });
  expect(inspectAsset(new Uint8Array([0xff, 0x41]))).toEqual({
    mediaType: 'text/plain; charset=utf-8',
  });
  expect(inspectAsset(new Uint8Array())).toEqual({
    mediaType: 'text/plain; charset=utf-8',
  });
  expect(inspectAsset(new Uint8Array([0, 1, 2, 255]))).toEqual({
    mediaType: 'application/octet-stream',
  });
});

test('builds status-aware before and after asset metadata', () => {
  const before = pngFixture(10, 10);
  const after = jpegFixture(20, 10);

  expect(buildAssetDiffMetadata(before, after, 'modified')).toEqual({
    before: expect.objectContaining({ mediaType: 'image/png' }),
    after: expect.objectContaining({ mediaType: 'image/jpeg' }),
  });
  expect(buildAssetDiffMetadata(before, after, 'added')).toEqual({
    after: expect.objectContaining({ mediaType: 'image/jpeg' }),
  });
  expect(buildAssetDiffMetadata(before, after, 'deleted')).toEqual({
    before: expect.objectContaining({ mediaType: 'image/png' }),
  });
  expect(buildAssetDiffMetadata(before, after, 'untracked')).toEqual({
    after: expect.objectContaining({ mediaType: 'image/jpeg' }),
  });
});

test('matches Go content sniff signatures and the 512-byte limit', () => {
  const mp4 = new Uint8Array(20);
  new DataView(mp4.buffer).setUint32(0, 20);
  mp4.set(new TextEncoder().encode('ftypisom\0\0\0\0mp41'), 4);
  const afterSniffWindow = new Uint8Array(514).fill(0x41);
  afterSniffWindow.set([0x42, 0x4d], 512);
  const cases: Array<{ content: Uint8Array; mediaType: string }> = [
    {
      content: new Uint8Array([0xfe, 0xff, 0x00, 0x41]),
      mediaType: 'text/plain; charset=utf-16be',
    },
    {
      content: new Uint8Array([0xff, 0xfe, 0x41, 0x00]),
      mediaType: 'text/plain; charset=utf-16le',
    },
    {
      content: new Uint8Array([0xef, 0xbb, 0xbf, 0x41]),
      mediaType: 'text/plain; charset=utf-8',
    },
    { content: new Uint8Array([0x00, 0x00, 0x01, 0x00]), mediaType: 'image/x-icon' },
    { content: new TextEncoder().encode('BM'), mediaType: 'image/bmp' },
    { content: new TextEncoder().encode('ID3'), mediaType: 'audio/mpeg' },
    { content: new TextEncoder().encode('wOFF'), mediaType: 'font/woff' },
    { content: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), mediaType: 'application/zip' },
    { content: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]), mediaType: 'video/webm' },
    { content: mp4, mediaType: 'video/mp4' },
    { content: afterSniffWindow, mediaType: 'text/plain; charset=utf-8' },
  ];

  for (const item of cases) {
    expect(inspectAsset(item.content).mediaType).toBe(item.mediaType);
  }
});
