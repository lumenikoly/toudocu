import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { NavigationItem, PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { Badge, EmptyState } from './ui/index.js';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { PortalLink } from './routing.js';
import { ChangesWorkspace, DiscussionsWorkspace, EditorWorkspace } from './workspaces.js';

type DocumentView = Extract<PageViewV1, { kind: 'document' }>['document'];
type DocumentPage = Extract<PageViewV1, { kind: 'document' | 'task' | 'changelog' }>;

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

function DocumentLink({
  snapshot,
  sourcePath,
}: {
  snapshot: PortalSnapshotV1;
  sourcePath: string;
}) {
  const page = pageForDocument(snapshot, sourcePath);
  return page ? <PortalLink to={page.route.href}>{page.document.title}</PortalLink> : sourcePath;
}

function Status({ status, locale }: { status: { kind: string; label: string }; locale: Locale }) {
  const value = status.label || status.kind;
  return (
    <Badge className="status" data-status={status.kind}>
      {translator(locale).status(value)}
    </Badge>
  );
}

function MermaidEnhancer({ pageId }: { pageId: string }) {
  useEffect(() => {
    const provided = (
      window as Window & { mermaid?: { run(options: { nodes: Element[] }): Promise<void> } }
    ).mermaid;
    const nodes = [...document.querySelectorAll<HTMLElement>('[data-mermaid] > code')];
    if (nodes.length > 0) {
      void (async () => {
        if (provided) {
          await provided.run({ nodes });
          return;
        }
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ securityLevel: 'strict', startOnLoad: false });
        await mermaid.run({ nodes });
      })().catch(() => {
        for (const node of nodes) node.parentElement?.setAttribute('data-mermaid-error', 'true');
      });
    }
  }, [pageId]);
  return null;
}

function DocumentBody({ document }: { document: DocumentView }) {
  const navigate = useNavigate();
  const follow = (event: MouseEvent<HTMLDivElement>): void => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) {
      return;
    }
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }
    event.preventDefault();
    const base = globalThis.document.documentElement.dataset.toudocuBase ?? '/';
    const pathname =
      base !== '/' && url.pathname.startsWith(`${base}/`)
        ? url.pathname.slice(base.length)
        : url.pathname;
    void navigate(`${pathname}${url.search}${url.hash}`);
  };
  return (
    <div
      className="document-body"
      onClick={follow}
      dangerouslySetInnerHTML={{ __html: document.html }}
    />
  );
}

function DocumentContent({ document }: { document: DocumentView }) {
  return (
    <article>
      <h1>{document.title}</h1>
      <DocumentBody document={document} />
    </article>
  );
}

function Relations({
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
      <section>
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

function TaskTree({
  snapshot,
  nodes,
  locale,
}: {
  snapshot: PortalSnapshotV1;
  nodes: Extract<PageViewV1, { kind: 'task' }>['hierarchy'];
  locale: Locale;
}) {
  return (
    <ul className="task-tree">
      {nodes.map((node) => {
        const route = snapshot.routes.find((item) => item.pageId === `task:${node.id}`);
        return (
          <li key={node.id}>
            {route ? <PortalLink to={route.href}>{node.title}</PortalLink> : node.title}{' '}
            <Status status={node.status} locale={locale} />
            {node.children.length > 0 && (
              <TaskTree snapshot={snapshot} nodes={node.children} locale={locale} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function CatalogPage({
  page,
  snapshot,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'catalog' }>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const keys: Partial<Record<string, MessageKey>> = {
    'use-cases': 'useCases',
    screens: 'screens',
    quality: 'quality',
    runbooks: 'runbooks',
    drafts: 'drafts',
  };
  const key = keys[page.data.section];
  return (
    <>
      <h1>{key ? text(key) : page.data.title}</h1>
      <ul className="catalog">
        {page.data.documents.map((document) => (
          <li key={document.sourcePath}>
            <DocumentLink snapshot={snapshot} sourcePath={document.sourcePath} />
          </li>
        ))}
      </ul>
    </>
  );
}

function SearchPage({
  page,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'search' }>;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [query, setQuery] = useState('');
  const entries = useMemo(() => {
    const value = query.trim().toLocaleLowerCase(locale);
    return value
      ? page.entries.filter((entry) =>
          `${entry.title}\n${entry.description}\n${entry.text}`
            .toLocaleLowerCase(locale)
            .includes(value),
        )
      : page.entries;
  }, [locale, page.entries, query]);
  return (
    <>
      <h1>{text('search')}</h1>
      <form className="search-form" role="search" onSubmit={(event) => event.preventDefault()}>
        <label>
          <span>{text('searchPlaceholder')}</span>
          <br />
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        </label>
      </form>
      {entries.length > 0 ? (
        <ul className="catalog">
          {entries.map((entry) => (
            <li key={`${entry.path}:${entry.title}`}>
              <PortalLink to={entry.url}>{entry.title}</PortalLink>
              {entry.description && <p>{entry.description}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={text('noResults')} />
      )}
    </>
  );
}

export function Page({
  page,
  snapshot,
  locale,
}: {
  page: PageViewV1;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  let content: ReactNode;
  switch (page.kind) {
    case 'home':
      content = (
        <>
          <h1>{page.project.title}</h1>
          {page.project.description && !page.document && <p>{page.project.description}</p>}
          <div className="summary-grid">
            <div>{`${page.stats.documents} ${text('documents')}`}</div>
            <div>{`${page.stats.totalTasks} ${text('tasks')}`}</div>
            <div>{`${page.stats.errors} ${text('errors')}`}</div>
          </div>
          {page.document && <DocumentBody document={page.document} />}
        </>
      );
      break;
    case 'document':
      content = (
        <>
          <DocumentContent document={page.document} />
          <Relations snapshot={snapshot} {...page.relations} locale={locale} />
        </>
      );
      break;
    case 'task':
      content = (
        <>
          <DocumentContent document={page.document} />
          <p>
            <Status status={page.workItem.status} locale={locale} />
          </p>
          <h2>{text('criteria')}</h2>
          <ul>
            {page.workItem.criteria.map((criterion) => (
              <li key={`${criterion.line}:${criterion.text}`}>
                <input type="checkbox" checked={criterion.completed} readOnly /> {criterion.text}
              </li>
            ))}
          </ul>
          <TaskTree snapshot={snapshot} nodes={page.hierarchy} locale={locale} />
          <Relations snapshot={snapshot} {...page.relations} locale={locale} />
        </>
      );
      break;
    case 'catalog':
      content = <CatalogPage page={page} snapshot={snapshot} locale={locale} />;
      break;
    case 'processes':
      content = (
        <>
          <h1>{text('processes')}</h1>
          <ul className="catalog">
            {page.flows.map((flow) => (
              <li key={flow.id}>
                {flow.id}: {flow.title}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'screens':
      content = (
        <>
          <h1>{text('screens')}</h1>
          <ul className="catalog">
            {page.screens.map((screen) => (
              <li key={screen.id}>
                {screen.id}: {screen.title}
              </li>
            ))}
          </ul>
          <h2>{text('transitions')}</h2>
          <ul className="catalog">
            {page.transitions.map((transition) => (
              <li key={transition.id}>
                {transition.source} → {transition.target}: {transition.action}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'traceability':
      content = (
        <>
          <h1>{text('traceability')}</h1>
          <table>
            <thead>
              <tr>
                <th>{text('screen')}</th>
                <th>{text('task')}</th>
                <th>{text('verification')}</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={`${row.screen}:${row.task}:${index}`}>
                  <td>{row.screen}</td>
                  <td>{row.task}</td>
                  <td>{row.verification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      );
      break;
    case 'health':
      content = (
        <>
          <h1>{text('health')}</h1>
          <p>
            {page.stats.errors} {text('errors')}, {page.stats.warnings} {text('warnings')}
          </p>
          <h2>{text('issues')}</h2>
          <ul>
            {page.issues.map((issue, index) => (
              <li key={`${issue.code}:${issue.documentPath}:${index}`}>
                {issue.code}: {issue.message}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'search':
      content = <SearchPage page={page} locale={locale} />;
      break;
    case 'roadmap':
      content = (
        <>
          <h1>{text('roadmap')}</h1>
          {page.stages.map((stage) => (
            <section key={stage.title}>
              <h2>{stage.title}</h2>
              <Status status={stage.status} locale={locale} />
              <ul>
                {stage.items.map((item) => (
                  <li key={`${item.id}:${item.text}`}>
                    {item.id}: {item.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {page.risks.length > 0 && <h2>{text('risks')}</h2>}
          <ul>
            {page.risks.map((risk) => (
              <li key={risk.id}>
                {risk.id}: {risk.title}
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case 'changelog':
      content = <DocumentContent document={page.document} />;
      break;
    case 'task-workspace':
      content = (
        <>
          <h1>{text('tasks')}</h1>
          <TaskTree snapshot={snapshot} nodes={page.hierarchy} locale={locale} />
        </>
      );
      break;
    case 'not-found':
      content = (
        <>
          <h1>{text('notFound')}</h1>
          <PortalLink to="index.html">{text('home')}</PortalLink>
        </>
      );
      break;
    case 'editor':
      content = <EditorWorkspace locale={locale} />;
      break;
    case 'changes':
      content = <ChangesWorkspace locale={locale} />;
      break;
    case 'discussions':
      content = <DiscussionsWorkspace locale={locale} />;
      break;
    case 'api-docs':
      content = (
        <>
          <h1>{text(page.kind === 'api-docs' ? 'apiDocs' : page.kind)}</h1>
          <p className="surface-note">{text('workspaceUnavailable')}</p>
        </>
      );
      break;
  }
  return (
    <main className="page">
      <MermaidEnhancer pageId={page.pageId} />
      {content}
    </main>
  );
}

export function Navigation({ items, locale }: { items: NavigationItem[]; locale: Locale }) {
  const { text } = translator(locale);
  const generatedTitle = (item: NavigationItem): string => {
    const keys: Partial<Record<string, MessageKey>> = {
      home: 'home',
      'use-cases': 'useCases',
      processes: 'processes',
      screens: 'screens',
      'screen-map': 'screens',
      traceability: 'traceability',
      roadmap: 'roadmap',
      changelog: 'changelog',
      health: 'health',
      'task-workspace': 'taskWorkspace',
      editor: 'editor',
      changes: 'changes',
      discussions: 'discussions',
      'api-docs': 'apiDocs',
    };
    const key = keys[item.pageId];
    return key ? text(key) : item.title;
  };
  const render = (entries: NavigationItem[]): ReactNode => (
    <ul>
      {entries.map((item) => (
        <li key={item.id}>
          <PortalLink to={item.href}>{generatedTitle(item)}</PortalLink>
          {item.children.length > 0 && render(item.children)}
        </li>
      ))}
    </ul>
  );
  return <nav aria-label={text('navigation')}>{render(items)}</nav>;
}
