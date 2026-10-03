import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse.js';

describe('Markdown rendering policy', () => {
  it('escapes raw HTML and keeps it out of the rendered DOM', () => {
    const html = parseMarkdown('<script>alert(1)</script> & <b>x</b>').render();

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&#x3C;script>alert(1)&#x3C;/script>');
    expect(html).toContain('&#x26;');
  });

  it('blocks encoded and control-character unsafe schemes', () => {
    const nul = String.fromCharCode(0);
    const source = [
      '[encoded](java%73cript:alert(1))',
      `[control](java${nul}script:alert(1))`,
      '[data](data:text/html,alert(1))',
    ].join(' ');

    const html = parseMarkdown(source).render();

    expect(html).not.toMatch(/<a\b[^>]*href=/);
    expect(html.match(/<span>/g)).toHaveLength(3);
  });

  it('does not let a link resolver bypass scheme policy', () => {
    const html = parseMarkdown('[link](https://example.com)').render({
      resolveLink: () => ({ href: 'javascript:alert(1)', external: false, blocked: false }),
    });

    expect(html).not.toMatch(/<a\b/);
    expect(html).toContain('<span>link</span>');
  });

  it('renders reference links and permits generated HTML routes', () => {
    const html = parseMarkdown('[guide][route]\n\n[route]: guide.md "Guide"').render({
      resolveLink: () => ({ href: 'guide.html', external: false, blocked: false }),
    });

    expect(html).toContain('<a href="guide.html" title="Guide">guide</a>');
    expect(parseMarkdown('[asset](guide.html)').render()).not.toContain('<a');
  });

  it('blocks backslash network paths and active assets introduced by image resolvers', () => {
    for (const href of [
      '//example.com/image.png',
      '\\\\example.com/image.png',
      'image.svg',
      'script.cjs',
    ]) {
      const html = parseMarkdown('![image](image.png)').render({
        resolveLink: () => ({ href, external: false, blocked: false }),
      });
      expect(html).not.toContain('<img');
    }
  });

  it('blocks external images while keeping safe local images', () => {
    const html = parseMarkdown(
      '![remote](https://cdn.example/image.png) ![local](assets/image.png)',
    ).render();

    expect(html).toContain('<span>remote</span>');
    expect(html).toContain('<img src="assets/image.png" alt="local" loading="lazy">');
    expect(html).not.toContain('src="https://cdn.example/image.png"');
  });

  it('supports skipH1 and renders only valid Mermaid as a diagram', () => {
    const source = [
      '# Title',
      '',
      '## Section',
      '',
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
      '',
      '```mermaid',
      '%%{init: {"theme": "dark"}}%%',
      'flowchart TD',
      '```',
    ].join('\n');
    const html = parseMarkdown(source).render({ skipH1: true });

    expect(html).not.toContain('<h1');
    expect(html).toContain('<h2 id="section">Section</h2>');
    expect(html).toContain('<pre data-mermaid><code class="language-mermaid">');
    expect(html).toContain('<pre><code class="language-mermaid">%%{init:');
  });

  it('renders forbidden front matter as escaped source before the document', () => {
    const html = parseMarkdown('---\ntitle: unsafe\n---\n\n# Title').render();

    expect(html).toContain('title: unsafe');
    expect(html).toContain('<h1 id="title">Title</h1>');
  });
});
