import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('web design system boundary', () => {
  it('reuses the existing tokens without creating another portal stylesheet', async () => {
    const css = await readFile(new URL('../app/styles/app.css', import.meta.url), 'utf8');
    expect(css).toContain("@import './tokens.css'");
    expect(css).not.toContain('portal.css');
  });
});
