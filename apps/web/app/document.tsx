import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { Badge, Icon } from './ui/index.js';
import { translator, type Locale } from './i18n.js';
import { PortalLink } from './routing.js';
import { createIcon, type IconName } from './design/icons.js';

export type DocumentView = Extract<PageViewV1, { kind: 'document' }>['document'];
type DocumentPage = Extract<PageViewV1, { kind: 'document' | 'task' | 'changelog' }>;

export function documentTitle(document: Pick<DocumentView, 'id' | 'title'>): string {
  return document.id && document.title.startsWith(`${document.id}:`)
    ? document.title.slice(document.id.length + 1).trim()
    : document.title;
}

export function EntityIdentity({ document }: { document: Pick<DocumentView, 'id' | 'title'> }) {
  return (
    <>
      {document.id && (
        <>
          <code className="entity-id">{document.id}</code>{' '}
        </>
      )}
      <span className="entity-title">{documentTitle(document)}</span>
    </>
  );
}

function pageForDocument(snapshot: PortalSnapshotV1, sourcePath: string): DocumentPage | undefined {
  for (const page of snapshot.pages) {
    if (
      (page.kind === 'document' || page.kind === 'task' || page.kind === 'changelog') &&
      page.document.sourcePath === sourcePath
    ) {
      return page;
    }
  }
  return undefined;
}

export function DocumentLink({
  snapshot,
  sourcePath,
  children,
}: {
  snapshot: PortalSnapshotV1;
  sourcePath: string;
  children?: ReactNode;
}) {
  const page = pageForDocument(snapshot, sourcePath);
  return page ? (
    <PortalLink to={page.route.href}>
      {children ?? <EntityIdentity document={page.document} />}
    </PortalLink>
  ) : (
    (children ?? sourcePath)
  );
}

export function Status({
  status,
  locale,
}: {
  status: { kind: string; label: string };
  locale: Locale;
}) {
  if (!status.kind || status.kind === 'neutral') return null;
  const value = status.label || status.kind;
  return (
    <Badge className="status" data-status={status.kind}>
      {translator(locale).status(status.kind || value)}
    </Badge>
  );
}

export function MermaidEnhancer({ pageId, locale }: { pageId: string; locale: Locale }) {
  const { text } = translator(locale);
  useEffect(() => {
    const root = globalThis.document.getElementById('main-content');
    if (!root) return;
    let mounted = true;
    const processed = new WeakSet<HTMLElement>();
    const removeFullscreenListeners = new Set<() => void>();
    const addControls = (node: HTMLElement): void => {
      const diagram = node.parentElement;
      if (!diagram || diagram.closest('.mermaid-frame')) return;
      const frame = document.createElement('div');
      frame.className = 'mermaid-frame';
      frame.dataset.mermaidScale = '1';
      const viewport = document.createElement('div');
      viewport.className = 'mermaid-viewport';
      const svg = node.querySelector<SVGElement>('svg');
      const baseWidth = svg?.getBoundingClientRect().width ?? 0;
      const baseHeight = svg?.getBoundingClientRect().height ?? 0;
      const pointers = new Map<number, { x: number; y: number }>();
      let drag: {
        id: number;
        x: number;
        y: number;
        left: number;
        top: number;
        moved: boolean;
      } | null = null;
      let pinch: { distance: number; scale: number; contentX: number; contentY: number } | null =
        null;
      let suppressClick = false;
      let clickTimer = 0;
      const setScale = (scale: number): void => {
        const value = Math.min(2.5, Math.max(0.5, scale));
        frame.dataset.mermaidScale = String(value);
        if (svg && baseWidth && baseHeight) {
          svg.style.width = `${baseWidth * value}px`;
          svg.style.height = `${baseHeight * value}px`;
          svg.style.transform = 'none';
        }
      };
      const point = (clientX: number, clientY: number): { x: number; y: number } => {
        const rect = viewport.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      };
      const svgOffset = (): { x: number; y: number } => {
        const viewportRect = viewport.getBoundingClientRect();
        const svgRect = svg?.getBoundingClientRect();
        return svgRect
          ? { x: svgRect.left - viewportRect.left, y: svgRect.top - viewportRect.top }
          : { x: 0, y: 0 };
      };
      const onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size >= 2) {
          const [first, second] = [...pointers.values()];
          if (!first || !second) return;
          const middle = point((first.x + second.x) / 2, (first.y + second.y) / 2);
          const offset = svgOffset();
          const scale = Number(frame.dataset.mermaidScale ?? 1);
          pinch = {
            distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
            scale,
            contentX: (middle.x - offset.x) / scale,
            contentY: (middle.y - offset.y) / scale,
          };
          drag = null;
          event.preventDefault();
        } else {
          drag = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: viewport.scrollLeft,
            top: viewport.scrollTop,
            moved: false,
          };
        }
      };
      const onPointerMove = (event: PointerEvent): void => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch && pointers.size >= 2) {
          const [first, second] = [...pointers.values()];
          if (!first || !second) return;
          const middle = point((first.x + second.x) / 2, (first.y + second.y) / 2);
          const scale = Math.min(
            2.5,
            Math.max(
              0.5,
              pinch.scale * (Math.hypot(first.x - second.x, first.y - second.y) / pinch.distance),
            ),
          );
          setScale(scale);
          const offset = svgOffset();
          viewport.scrollLeft += offset.x + pinch.contentX * scale - middle.x;
          viewport.scrollTop += offset.y + pinch.contentY * scale - middle.y;
          event.preventDefault();
        } else if (drag?.id === event.pointerId) {
          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;
          if (!drag.moved) return;
          viewport.scrollLeft = drag.left - (event.clientX - drag.x);
          viewport.scrollTop = drag.top - (event.clientY - drag.y);
          event.preventDefault();
        }
      };
      const onPointerUp = (event: PointerEvent): void => {
        pointers.delete(event.pointerId);
        if (drag?.id === event.pointerId && drag.moved) {
          suppressClick = true;
          window.clearTimeout(clickTimer);
          clickTimer = window.setTimeout(() => (suppressClick = false), 0);
        }
        drag = null;
        if (pointers.size < 2) pinch = null;
      };
      const onClick = (event: globalThis.MouseEvent): void => {
        if (!suppressClick) return;
        suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        const scale = Number(frame.dataset.mermaidScale ?? 1);
        const next = Math.min(2.5, Math.max(0.5, scale * Math.exp(-event.deltaY * 0.002)));
        const at = point(event.clientX, event.clientY);
        const offset = svgOffset();
        const contentX = (at.x - offset.x) / scale;
        const contentY = (at.y - offset.y) / scale;
        setScale(next);
        const nextOffset = svgOffset();
        viewport.scrollLeft += nextOffset.x + contentX * next - at.x;
        viewport.scrollTop += nextOffset.y + contentY * next - at.y;
      };
      viewport.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      viewport.addEventListener('click', onClick, true);
      viewport.addEventListener('wheel', onWheel, { passive: false });
      removeFullscreenListeners.add(() => {
        viewport.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
        viewport.removeEventListener('click', onClick, true);
        viewport.removeEventListener('wheel', onWheel);
        window.clearTimeout(clickTimer);
      });
      const toolbar = document.createElement('div');
      toolbar.className = 'mermaid-toolbar';
      toolbar.setAttribute('aria-label', text('diagramControls'));
      const addButton = (name: IconName, label: string, action: () => void): void => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mermaid-control icon-button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.append(createIcon(name));
        button.addEventListener('click', action);
        toolbar.append(button);
      };
      addButton('minus', text('zoomOut'), () =>
        setScale(Number(frame.dataset.mermaidScale ?? 1) - 0.1),
      );
      addButton('history', text('resetZoom'), () => setScale(1));
      addButton('plus', text('zoomIn'), () =>
        setScale(Number(frame.dataset.mermaidScale ?? 1) + 0.1),
      );
      addButton('fit', text('fitDiagram'), () => {
        setScale(baseWidth > 0 ? Math.min(1, (viewport.clientWidth - 16) / baseWidth) : 1);
        viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      });
      const fullscreen = document.createElement('button');
      fullscreen.type = 'button';
      fullscreen.className = 'mermaid-control icon-button';
      fullscreen.title = text('fullscreen');
      fullscreen.setAttribute('aria-label', text('fullscreen'));
      fullscreen.append(createIcon('maximize'));
      fullscreen.disabled = typeof frame.requestFullscreen !== 'function';
      fullscreen.addEventListener('click', () => {
        if (document.fullscreenElement === frame) {
          void document.exitFullscreen();
        } else {
          void frame.requestFullscreen?.();
        }
      });
      toolbar.append(fullscreen);
      diagram.replaceWith(frame);
      frame.append(toolbar, viewport);
      viewport.append(diagram);
      const onFullscreenChange = (): void => {
        if (!frame.isConnected) return;
        const active = document.fullscreenElement === frame;
        const label = active ? text('exitFullscreen') : text('fullscreen');
        fullscreen.title = label;
        fullscreen.setAttribute('aria-label', label);
        fullscreen.replaceChildren(createIcon(active ? 'minimize' : 'maximize'));
      };
      document.addEventListener('fullscreenchange', onFullscreenChange);
      removeFullscreenListeners.add(() =>
        document.removeEventListener('fullscreenchange', onFullscreenChange),
      );
    };
    const renderNodes = async (nodes: HTMLElement[]): Promise<void> => {
      const fresh = nodes.filter((node) => {
        if (processed.has(node)) return false;
        processed.add(node);
        return root.contains(node) && !node.parentElement?.closest('.mermaid-frame');
      });
      if (fresh.length === 0) return;
      try {
        const provided = (
          window as Window & { mermaid?: { run(options: { nodes: Element[] }): Promise<void> } }
        ).mermaid;
        if (provided) {
          await provided.run({ nodes: fresh });
        } else {
          const mermaid = (await import('mermaid')).default;
          if (!mounted) return;
          mermaid.initialize({
            securityLevel: 'strict',
            startOnLoad: false,
            theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
          });
          await mermaid.run({ nodes: fresh });
        }
        if (!mounted) return;
        for (const node of fresh) {
          if (root.contains(node)) addControls(node);
        }
      } catch {
        if (!mounted) return;
        for (const node of fresh) {
          const diagram = node.parentElement;
          if (!root.contains(node) || !diagram || diagram.closest('.mermaid-frame')) continue;
          diagram.setAttribute('data-mermaid-error', 'true');
          if (!diagram.querySelector('.mermaid-error')) {
            const message = document.createElement('p');
            message.className = 'mermaid-error';
            message.setAttribute('role', 'alert');
            message.textContent = text('diagramUnavailable');
            diagram.prepend(message);
          }
          addControls(node);
        }
      }
    };
    const collectNodes = (element: Element, nodes: HTMLElement[]): void => {
      if (element instanceof HTMLElement && element.matches('[data-mermaid] > code')) {
        nodes.push(element);
      }
      nodes.push(...element.querySelectorAll<HTMLElement>('[data-mermaid] > code'));
    };
    const observer = new MutationObserver((records) => {
      const nodes: HTMLElement[] = [];
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (added instanceof Element) collectNodes(added, nodes);
        }
      }
      void renderNodes(nodes);
    });
    observer.observe(root, { childList: true, subtree: true });
    void renderNodes([...root.querySelectorAll<HTMLElement>('[data-mermaid] > code')]);
    return () => {
      mounted = false;
      observer.disconnect();
      for (const remove of removeFullscreenListeners) remove();
    };
  }, [locale, pageId]);
  return null;
}

export function DocumentBody({ document, locale }: { document: DocumentView; locale: Locale }) {
  const { text } = translator(locale);
  const navigate = useNavigate();
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = body.current;
    if (!root) return;
    for (const block of root.querySelectorAll('pre')) {
      if (block.querySelector(':scope > .copy-code')) continue;
      const button = globalThis.document.createElement('button');
      button.type = 'button';
      button.className = 'copy-code';
      button.textContent = text('copy');
      button.addEventListener('click', () => {
        void navigator.clipboard
          .writeText(block.querySelector('code')?.textContent ?? '')
          .then(() => {
            button.textContent = text('copied');
            window.setTimeout(() => (button.textContent = text('copy')), 1200);
          });
      });
      block.append(button);
    }
    for (const heading of root.querySelectorAll<HTMLHeadingElement>('h2')) {
      if (heading.querySelector(':scope > .section-toggle')) continue;
      const button = globalThis.document.createElement('button');
      button.type = 'button';
      button.className = 'section-toggle';
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', `${text('collapseSection')}: ${heading.textContent ?? ''}`);
      button.addEventListener('click', () => {
        const collapsed = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', String(!collapsed));
        for (
          let node = heading.nextElementSibling;
          node && node.tagName !== 'H2';
          node = node.nextElementSibling
        ) {
          (node as HTMLElement).hidden = collapsed;
        }
      });
      heading.prepend(button);
    }
  }, [document.sourcePath]);
  const follow = (event: MouseEvent<HTMLDivElement>): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) {
      return;
    }
    const base = globalThis.document.documentElement.dataset.toudocuBase ?? '/';
    const source = new URL(
      `${base.replace(/\/$/u, '')}/${document.outputPath}`,
      window.location.origin,
    );
    const url = new URL(link.getAttribute('href') ?? '', source);
    if (url.origin !== window.location.origin) {
      return;
    }
    if (url.pathname === window.location.pathname && url.hash) return;
    event.preventDefault();
    const pathname =
      base !== '/' && url.pathname.startsWith(`${base}/`)
        ? url.pathname.slice(base.length)
        : url.pathname;
    void navigate(`${pathname}${url.search}${url.hash}`);
  };
  return (
    <div ref={body} className="document-body" onClick={follow}>
      <div className="document-prose" dangerouslySetInnerHTML={{ __html: document.html }} />
    </div>
  );
}

export function DocumentContent({
  document,
  locale,
  snapshot,
  children,
  content,
}: {
  document: DocumentView;
  locale: Locale;
  snapshot?: PortalSnapshotV1 | undefined;
  children?: ReactNode;
  content?: ReactNode;
}) {
  const { text } = translator(locale);
  return (
    <article className="document">
      <header className="document-header">
        <div className="document-identity">
          <span>
            {translator(locale).documentType(document.type)}
            {document.id && (
              <>
                {' '}
                · <code>{document.id}</code>
              </>
            )}
          </span>
          {document.status.kind && <Status status={document.status} locale={locale} />}
        </div>
        <h1>{documentTitle(document)}</h1>
        <dl className="document-metadata">
          {document.metadata.owner && (
            <div>
              <dt>{text('owner')}</dt>
              <dd>{document.metadata.owner}</dd>
            </div>
          )}
          <div>
            <dt>{text('updated')}</dt>
            <dd>
              <time dateTime={document.updatedAt}>{document.updatedAt.slice(0, 10)}</time>
            </dd>
          </div>
          {Object.entries(document.metadata)
            .filter(([key, value]) => value && !['id', 'owner', 'updated', 'status'].includes(key))
            .slice(0, 6)
            .map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          <div className="document-path">
            <dt>{text('path')}</dt>
            <dd>
              <code>{document.sourcePath}</code>
            </dd>
          </div>
        </dl>
        {(document.warnings > 0 || document.errors > 0 || document.stale) && (
          <div className="document-signals" role="status">
            {document.errors > 0 && (
              <span data-severity="error">
                {document.errors} {text('errorsCount')}
              </span>
            )}
            {document.warnings > 0 && (
              <span data-severity="warning">
                {document.warnings} {text('warningsCount')}
              </span>
            )}
            {document.stale && <span>{text('staleLabel')}</span>}
          </div>
        )}
        <DocumentActions document={document} snapshot={snapshot} locale={locale} />
      </header>
      {children}
      {content ?? <DocumentReadingView document={document} locale={locale} />}
    </article>
  );
}

function DocumentActions({
  document,
  snapshot,
  locale,
}: {
  document: DocumentView;
  snapshot?: PortalSnapshotV1 | undefined;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [copied, setCopied] = useState(false);
  const editor = snapshot?.routes.find((route) => route.pageId === 'editor');
  const changes = snapshot?.routes.find((route) => route.pageId === 'changes');
  const discussions = snapshot?.routes.find((route) => route.pageId === 'discussions');
  const copy = async (): Promise<void> => {
    const value = `${document.title}\n${document.sourcePath}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      setCopied(false);
    }
  };
  const discuss = (): void => {
    const selectedText = globalThis.getSelection?.()?.toString().trim();
    globalThis.document.dispatchEvent(
      new CustomEvent('toudocu:discussion-compose', {
        detail: {
          target: { kind: 'document', path: document.sourcePath, documentId: document.id },
          ...(selectedText ? { selection: { selectedText } } : {}),
        },
      }),
    );
  };
  return (
    <div className="document-actions" role="toolbar" aria-label={text('documentActions')}>
      <button
        className="icon-button"
        type="button"
        aria-label={copied ? text('copied') : text('copyContext')}
        title={copied ? text('copied') : text('copyContext')}
        onClick={() => void copy()}
      >
        <Icon name={copied ? 'checkCircle' : 'clipboard'} />
      </button>
      {editor && (
        <PortalLink
          className="icon-button is-primary"
          to={`${editor.href}?path=${encodeURIComponent(document.sourcePath)}`}
          label={text('edit')}
        >
          <Icon name="edit" />
        </PortalLink>
      )}
      {changes && (
        <PortalLink
          className="icon-button"
          label={text('changes')}
          to={`${changes.href}?path=${encodeURIComponent(document.sourcePath)}`}
        >
          <Icon name="history" />
        </PortalLink>
      )}
      {discussions && (
        <button
          className="icon-button"
          type="button"
          aria-label={text('discussions')}
          title={text('discussions')}
          onClick={discuss}
        >
          <Icon name="messageSquare" />
        </button>
      )}
      {snapshot?.capabilities.editing && (
        <a
          className="icon-button"
          aria-label={text('source')}
          title={text('source')}
          href={`/_toudocu/api/editor/file?raw=1&path=${encodeURIComponent(document.sourcePath)}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon name="file" />
        </a>
      )}
    </div>
  );
}

export function DocumentReadingView({
  document,
  locale,
}: {
  document: DocumentView;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const sections = document.sections.filter((section) => section.level > 1 && section.level < 4);
  const [active, setActive] = useState('');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const headings = sections.flatMap((section) => {
      const heading = globalThis.document.getElementById(section.id);
      return heading ? [heading] : [];
    });
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: '-15% 0px -70%' },
    );
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [document.sourcePath]);
  return (
    <div className="document-layout">
      <DocumentBody document={document} locale={locale} />
      {sections.length > 0 && (
        <details className="document-toc" open>
          <summary>{text('contents')}</summary>
          <nav aria-label={text('contents')}>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`} data-level={section.level}>
                {active === section.id && <span className="toc-marker" aria-hidden="true" />}
                {section.title}
              </a>
            ))}
          </nav>
        </details>
      )}
    </div>
  );
}

export function Relations({
  snapshot,
  related,
  backlinks,
  locale,
}: {
  snapshot: PortalSnapshotV1;
  related: readonly string[];
  backlinks: readonly string[];
  locale: Locale;
}) {
  const { text } = translator(locale);
  const list = (title: string, paths: readonly string[]) =>
    paths.length > 0 && (
      <section className="relations-section">
        <h2>{title}</h2>
        <ul className="relations">
          {paths.map((path) => (
            <li key={path}>
              <DocumentLink snapshot={snapshot} sourcePath={path} />
            </li>
          ))}
        </ul>
      </section>
    );
  return (
    <>
      {list(text('related'), related)}
      {list(text('backlinks'), backlinks)}
    </>
  );
}
