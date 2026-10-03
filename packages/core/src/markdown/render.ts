import { toHast } from 'mdast-util-to-hast';
import { toHtml } from 'hast-util-to-html';
import type { Root } from 'mdast';
import type { Nodes, Root as HtmlRoot } from 'hast';
import type { MarkdownAnalysis } from './model.js';
import { checkMermaid } from './mermaid.js';

export interface LinkResolution {
  href: string;
  external: boolean;
  blocked: boolean;
  broken?: boolean;
}

export interface RenderOptions {
  skipH1?: boolean;
  resolveLink?: (destination: string, image: boolean, title: string) => LinkResolution;
}

function urlPolicy(value: string, checkResource = true): { blocked: boolean; external: boolean } {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return { blocked: true, external: false };
  }
  const normalized = decoded.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  const scheme = /^[^/?#]*:/.exec(normalized)?.[0];
  const external = /^(?:https?:|mailto:|tel:|\/\/)/.test(normalized);
  const blocked =
    normalized.includes('\\') ||
    (!!scheme && !external) ||
    (checkResource && /\.(?:svg|svgz|xml|xhtml|html?|js|mjs|cjs)(?:[?#]|$)/.test(normalized));
  return { blocked, external };
}

/** Render only semantic document elements. React owns all page UI and controls. */
export function renderMarkdown(
  tree: Root,
  analysis: MarkdownAnalysis,
  source: string,
  options: RenderOptions,
): string {
  const forbiddenFrontMatter = analysis.diagnostics.find(
    (diagnostic) => diagnostic.code === 'forbidden-front-matter',
  );
  const endLine = forbiddenFrontMatter?.range.end.line ?? 0;
  const filtered: Root = {
    ...tree,
    children: tree.children.filter(
      (node) =>
        !(options.skipH1 && node.type === 'heading' && node.depth === 1) &&
        (endLine === 0 || (node.position?.start.line ?? 0) > endLine),
    ),
  };
  const html = toHast(filtered, {
    allowDangerousHtml: false,
    handlers: {
      html: (_state, node) => ({ type: 'text', value: node.value }),
      code: (_state, node) => {
        const info = `${node.lang ?? ''}${node.meta ? ` ${node.meta}` : ''}`;
        const mermaid = info.toLowerCase() === 'mermaid' && checkMermaid(node.value).valid;
        const language = /^[\p{L}\p{Nd}_+.-]+/u.exec(node.lang ?? '')?.[0];
        return {
          type: 'element',
          tagName: 'pre',
          properties: mermaid ? { dataMermaid: true } : {},
          children: [
            {
              type: 'element',
              tagName: 'code',
              properties: language ? { className: [`language-${language}`] } : {},
              children: [{ type: 'text', value: node.value }],
            },
          ],
        };
      },
    },
  });
  if (!html || html.type !== 'root')
    throw new Error('Markdown renderer did not produce a document');
  if (forbiddenFrontMatter) {
    const body = source.split('\n').slice(0, endLine).join('\n');
    const prefix: HtmlRoot['children'][number] = {
      type: 'element',
      tagName: 'pre',
      properties: {},
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [{ type: 'text', value: body }],
        },
      ],
    };
    html.children.unshift(prefix);
  }
  const secure = (node: Nodes): void => {
    if (node.type === 'element' && (node.tagName === 'a' || node.tagName === 'img')) {
      const image = node.tagName === 'img';
      const destination = image ? node.properties.src : node.properties.href;
      const url = typeof destination === 'string' ? destination : '';
      const title = typeof node.properties.title === 'string' ? node.properties.title : '';
      const initial = urlPolicy(url);
      const resolution = options.resolveLink?.(url, image, title) ?? { href: url, ...initial };
      const resolved = urlPolicy(resolution.href, image);
      if (
        initial.blocked ||
        resolution.blocked ||
        resolved.blocked ||
        (image && (resolution.external || resolved.external))
      ) {
        const alt = typeof node.properties.alt === 'string' ? node.properties.alt : '';
        node.tagName = 'span';
        node.properties = {};
        if (image) node.children = [{ type: 'text', value: alt }];
      } else if (image) {
        node.properties.src = resolution.href;
        node.properties.loading = 'lazy';
      } else {
        node.properties.href = resolution.href || '#';
        if (resolution.external || resolved.external) {
          node.properties.target = '_blank';
          node.properties.rel = ['noopener', 'noreferrer'];
        }
      }
    }
    if ('children' in node) for (const child of node.children) secure(child);
  };
  secure(html);
  return toHtml(html, { allowDangerousHtml: false });
}
