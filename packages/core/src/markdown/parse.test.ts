import { describe, expect, it } from 'vitest';
import { parseMarkdown } from './parse.js';

describe('parseMarkdown legacy contracts', () => {
  it('maps Unicode heading ranges to UTF-8 byte positions', () => {
    const analysis = parseMarkdown('# я中😀é\n').analysis;

    expect(analysis.headings[0]).toMatchObject({
      title: 'я中😀é',
      id: 'я中e',
      range: { start: { offset: 0, line: 1, column: 1 }, end: { offset: 14, line: 1, column: 15 } },
    });
  });

  it('preserves escaped URL punctuation in the legacy destination contract', () => {
    const analysis = parseMarkdown('[escaped](https://example.com/a\\)b)').analysis;

    expect(analysis.links).toContainEqual(
      expect.objectContaining({
        label: 'escaped',
        destination: 'https://example.com/a\\)b',
        automatic: false,
      }),
    );
  });

  it('keeps Goldmark semantics for an unmatched destination parenthesis', () => {
    const analysis = parseMarkdown("[ссылка](https://example.com/a(b 'title')").analysis;

    expect(analysis.plainText).toBe('ссылка');
    expect(analysis.links[0]).toMatchObject({
      label: 'ссылка',
      destination: 'https://example.com/a(b',
      title: 'title',
      automatic: false,
      range: { start: { offset: 0 }, end: { offset: 13 } },
    });
  });

  it('repairs the same legacy link form in inline parents but not inline code', () => {
    const source = [
      "# [ссылка](https://example.com/a(b 'title')",
      '',
      "[описание](https://example.com/a(b 'title')",
      '',
      "- [пункт](https://example.com/a(b 'title')",
      '',
      "`[код](https://example.com/a(b 'title')`",
    ].join('\n');
    const document = parseMarkdown(source);

    expect(document.analysis.headings[0]?.title).toBe('ссылка');
    expect(document.analysis.description).toBe('описание');
    expect(document.analysis.listItems[0]?.text).toBe('пункт');
    expect(document.analysis.links).toHaveLength(3);
    expect(document.analysis.plainText).toContain("[код](https://example.com/a(b 'title')");

    const html = document.render();
    expect(html.match(/href="https:\/\/example\.com\/a\(b"/g)).toHaveLength(3);
    expect(html).toContain("<code>[код](https://example.com/a(b 'title')</code>");
  });

  it('keeps decoded surrounding text and ignores escaped and image openers', () => {
    const source = [
      "\\* &amp; [ссылка](https://example.com/a(b 'title') &amp; \\_",
      '',
      "\\[эскейп](https://example.com/a(b 'title')",
      '',
      "![картинка](https://example.com/a(b 'title')",
    ].join('\n');
    const document = parseMarkdown(source);

    expect(document.analysis.links.filter((link) => !link.automatic)).toHaveLength(1);
    expect(document.analysis.plainText).toContain('* & ссылка & _');
    expect(document.analysis.plainText).toContain("[эскейп](https://example.com/a(b 'title')");
    expect(document.analysis.plainText).toContain('картинка');
    const rendered = document.render();
    expect(rendered).toContain('href="https://example.com/a(b" title="title"');
    expect(rendered.match(/title="title"/g)).toHaveLength(1);
  });

  it('reports raw HTML and forbidden front matter as diagnostics', () => {
    const analysis = parseMarkdown('---\ntitle: forbidden\n---\n\n<div>raw HTML</div>\n').analysis;

    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'forbidden-raw-html',
      'forbidden-front-matter',
    ]);
  });

  it('does not execute annotation markers or footnotes inside fenced/text input', () => {
    const analysis = parseMarkdown(
      [
        '```markdown',
        '<!-- toudocu',
        'id: hidden',
        'status: draft',
        '-->',
        '```',
        '',
        'foot[^1]',
        '',
        '[^1]: footnote syntax stays ordinary Markdown text.',
      ].join('\n'),
    ).analysis;

    expect(analysis.metadataBlocks).toBe(0);
    expect(analysis.codeBlocks).toHaveLength(1);
    expect(analysis.codeBlocks[0]?.source).toContain('id: hidden');
    expect(analysis.diagnostics).toEqual([]);
    expect(analysis.plainText).toContain('foot[^1]');
    expect(analysis.plainText).toContain('[^1]: footnote syntax stays ordinary Markdown text.');
    expect(analysis.links).toEqual([]);
  });

  it('keeps a blank line inside an empty fence in the source range', () => {
    const analysis = parseMarkdown('first line\n\n```\n\n```\n').analysis;

    expect(analysis.codeBlocks[0]).toMatchObject({
      source: '',
      fenced: true,
      closed: true,
      range: { start: { offset: 12, line: 3, column: 1 }, end: { offset: 17, line: 5, column: 1 } },
    });
  });

  it('matches Goldmark list item ranges around fenced code', () => {
    const cases = [
      {
        source: '- item\n  ```',
        end: { offset: 6, line: 1, column: 7 },
      },
      {
        source: '- item\n  ```\n  code\n  ```\n',
        end: { offset: 20, line: 4, column: 1 },
      },
      {
        source: '- outer\n  - inner\n    ```\n    code\n    ```\n',
        end: { offset: 35, line: 5, column: 1 },
      },
    ];

    for (const testCase of cases) {
      const analysis = parseMarkdown(testCase.source).analysis;
      expect(analysis.listItems[0]?.range.end).toEqual(testCase.end);
    }
  });

  it('attaches metadata, section, and table annotations to their elements', () => {
    const analysis = parseMarkdown(
      [
        '<!-- toudocu:section module -->',
        '<!-- toudocu',
        'key: value',
        'language: русский',
        '-->',
        '## Module',
        '',
        'Text after metadata.',
        '',
        '<!-- toudocu:table entities columns=id,title -->',
        '| id | title |',
        '| --- | --- |',
        '| A-1 | Первый |',
      ].join('\n'),
    ).analysis;

    expect(analysis.sections[0]).toMatchObject({
      kind: 'module',
      metadata: [
        { key: 'key', value: 'value' },
        { key: 'language', value: 'русский' },
      ],
    });
    expect(analysis.tables[0]).toMatchObject({
      kind: 'entities',
      columns: ['id', 'title'],
      headers: ['id', 'title'],
      rows: [{ cells: ['A-1', 'Первый'] }],
    });
    expect(analysis.diagnostics).toEqual([]);
  });
});
