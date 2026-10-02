import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  EditorFileResponseSchema,
  EditorSavedFileResponseSchema,
  type PageViewV1,
  type PortalSnapshotV1,
} from '@toudocu/contracts';
import { EmptyState } from './ui/index.js';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { PortalLink } from './routing.js';
import { ApiDocsWorkspace, EditorWorkspace } from './workspaces.js';
import { ChangesWorkspace } from './changes.js';

import {
  DocumentContent,
  DocumentReadingView,
  DocumentLink,
  EntityIdentity,
  MermaidEnhancer,
  Relations,
  Status,
} from './document.js';
import { HomePage } from './home.js';
import { ScreenMap } from './screen-map.js';
import { UseCaseModes } from './use-case.js';
import { TaskWorkspace } from './task-workspace.js';
import { TaskActions } from './task-actions.js';
import { DiscussionsWorkspace } from './discussions.js';

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
        const task = snapshot.pages.find(
          (page) => page.kind === 'task' && page.workItem.id === node.id,
        );
        const state = task?.kind === 'task' ? task.workItem.workspace.workState : node.status.kind;
        return (
          <li key={node.id}>
            {route ? (
              <PortalLink to={route.href}>
                <EntityIdentity document={node} />
              </PortalLink>
            ) : (
              <EntityIdentity document={node} />
            )}{' '}
            <Status status={{ kind: state, label: state }} locale={locale} />
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
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const statuses = [
    ...new Set(page.data.documents.map((document) => document.status.kind).filter(Boolean)),
  ];
  const needle = query.trim().toLocaleLowerCase(locale);
  const documents = page.data.documents.filter(
    (document) =>
      (!status || document.status.kind === status) &&
      (!needle || document.sourcePath.toLocaleLowerCase(locale).includes(needle)),
  );
  return (
    <>
      <h1>{key ? text(key) : page.data.title}</h1>
      <div className="collection-toolbar">
        <input
          type="search"
          value={query}
          placeholder={text('documentOrPath')}
          aria-label={text('search')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <select
          value={status}
          aria-label={text('status')}
          onChange={(event) => setStatus(event.currentTarget.value)}
        >
          <option value="">{text('allStatuses')}</option>
          {statuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <span>
          {documents.length} / {page.data.documents.length}
        </span>
        {(query || status) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setStatus('');
            }}
          >
            {text('reset')}
          </button>
        )}
      </div>
      <ul className="catalog">
        {documents.map((document) => (
          <li key={document.sourcePath}>
            <DocumentLink snapshot={snapshot} sourcePath={document.sourcePath} />
            {document.status.kind && <Status status={document.status} locale={locale} />}
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
        <ul className="search-results">
          {entries.map((entry) => (
            <li key={`${entry.path}:${entry.title}`}>
              <PortalLink to={entry.url} label={entry.title}>
                <span className="search-result-type">
                  {translator(locale).documentType(entry.type)}
                </span>
                <strong>{entry.title}</strong>
                {entry.description && <span>{entry.description}</span>}
                <code>{entry.path}</code>
              </PortalLink>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={text('noResults')} />
      )}
    </>
  );
}

function ProcessesPage({
  page,
  snapshot,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'processes' }>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [query, setQuery] = useState('');
  const [module, setModule] = useState('');
  const modules = [...new Set(page.flows.map((flow) => flow.moduleId).filter(Boolean))];
  const needle = query.trim().toLocaleLowerCase(locale);
  const flows = page.flows.filter(
    (flow) =>
      (!module || flow.moduleId === module) &&
      (!needle ||
        `${flow.id} ${flow.title} ${flow.moduleId ?? ''} ${flow.useCaseIds.join(' ')}`
          .toLocaleLowerCase(locale)
          .includes(needle)),
  );
  return (
    <>
      <header className="workspace-title">
        <h1>{text('processes')}</h1>
        <p>{text('flowsDescription')}</p>
      </header>
      <div className="collection-toolbar">
        <input
          type="search"
          value={query}
          placeholder={text('flowUseCaseModule')}
          aria-label={text('search')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <select
          value={module}
          aria-label={text('module')}
          onChange={(event) => setModule(event.currentTarget.value)}
        >
          <option value="">{text('allModules')}</option>
          {modules.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <span>
          {flows.length} / {page.flows.length}
        </span>
        {(query || module) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setModule('');
            }}
          >
            {text('reset')}
          </button>
        )}
      </div>
      <div className="process-board">
        {flows.map((flow) => (
          <section className="process-lane" key={flow.id}>
            <div className="process-node process-flow">
              <span className="topology-kind">FLOW</span>
              <DocumentLink snapshot={snapshot} sourcePath={flow.document} />
              {flow.moduleId && <code>{flow.moduleId}</code>}
            </div>
            <div className="process-links">
              {flow.useCaseIds.map((id) => {
                const useCase = page.useCases.find((item) => item.id === id);
                return (
                  <div className="process-node" key={id}>
                    <span className="topology-kind">USE CASE</span>
                    {useCase ? (
                      <DocumentLink snapshot={snapshot} sourcePath={useCase.document} />
                    ) : (
                      <code>{id}</code>
                    )}
                  </div>
                );
              })}
              {flow.useCaseIds.length === 0 && (
                <span className="empty-note">{text('noLinkedUseCases')}</span>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function TraceabilityPage({
  page,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'traceability' }>;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase(locale);
  const rows = page.rows.filter(
    (row) =>
      !needle ||
      `${row.screen} ${row.task} ${row.verification}`.toLocaleLowerCase(locale).includes(needle),
  );
  return (
    <>
      <h1>{text('traceability')}</h1>
      <div className="collection-toolbar">
        <input
          type="search"
          value={query}
          placeholder={text('screenTaskVerification')}
          aria-label={text('search')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <span>
          {rows.length} / {page.rows.length}
        </span>
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            {text('reset')}
          </button>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th>{text('screen')}</th>
            <th>{text('task')}</th>
            <th>{text('verification')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
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
}

function HealthPage({
  page,
  snapshot,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'health' }>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const severities = [...new Set(page.issues.map((issue) => issue.severity))];
  const needle = query.trim().toLocaleLowerCase(locale);
  const issues = page.issues.filter(
    (issue) =>
      (!severity || issue.severity === severity) &&
      (!needle ||
        `${issue.code} ${issue.message} ${issue.documentPath ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(needle)),
  );
  return (
    <>
      <h1>{text('health')}</h1>
      <p>
        {page.stats.errors} {text('errors')}, {page.stats.warnings} {text('warnings')}
      </p>
      <div className="collection-toolbar">
        <input
          type="search"
          value={query}
          placeholder={text('codeMessageDocument')}
          aria-label={text('search')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <select
          value={severity}
          aria-label={text('severity')}
          onChange={(event) => setSeverity(event.currentTarget.value)}
        >
          <option value="">{text('allSeverities')}</option>
          {severities.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <span>
          {issues.length} / {page.issues.length}
        </span>
        {(query || severity) && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setSeverity('');
            }}
          >
            {text('reset')}
          </button>
        )}
      </div>
      <h2>{text('issues')}</h2>
      <ul className="diagnostic-list">
        {issues.map((issue, index) => (
          <li key={`${issue.code}:${issue.documentPath}:${index}`}>
            <code data-severity={issue.severity}>{issue.code}</code>
            <div>
              {issue.message}
              {issue.documentPath && (
                <DocumentLink snapshot={snapshot} sourcePath={issue.documentPath} />
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function insertRoadmapItem(
  source: string,
  stageTitle: string,
  id: string,
  wording: string,
): string {
  const lines = source.split('\n');
  const heading = lines.findIndex(
    (line) => /^##\s+/u.test(line) && line.replace(/^##\s+/u, '').trim() === stageTitle,
  );
  if (heading < 0) throw new Error(`Roadmap stage not found: ${stageTitle}`);
  let insertAt = lines.findIndex((line, index) => index > heading && /^##\s+/u.test(line));
  if (insertAt < 0) insertAt = lines.length;
  while (insertAt > heading + 1 && !lines[insertAt - 1]?.trim()) insertAt -= 1;
  lines.splice(insertAt, 0, `- [ ] ${id.trim().toUpperCase()} ${wording.trim()}`);
  return lines.join('\n');
}

function RoadmapPage({
  page,
  snapshot,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'roadmap' }>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState(
    page.stages.find((item) => item.status.kind !== 'done')?.title ?? page.stages[0]?.title ?? '',
  );
  const [id, setId] = useState('DLV-');
  const [wording, setWording] = useState('');
  const [notice, setNotice] = useState('');
  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setNotice('');
    try {
      const read = EditorFileResponseSchema.parse(
        await fetch('/_toudocu/api/editor/file?path=roadmap.md').then((response) =>
          response.json(),
        ),
      );
      const content = insertRoadmapItem(read.file.content, stage, id, wording);
      const response = await fetch('/_toudocu/api/editor/file', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-toudocu-action': 'save' },
        body: JSON.stringify({
          path: 'roadmap.md',
          content,
          expectedDigest: read.file.digest,
          confirmOverwrite: false,
        }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      EditorSavedFileResponseSchema.parse(body);
      location.reload();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <>
      <header className="workspace-title roadmap-heading">
        <h1>{text('roadmap')}</h1>
        {snapshot.capabilities.editing && (
          <button type="button" onClick={() => setOpen(true)}>
            {text('addOutcome')}
          </button>
        )}
      </header>
      <div className="roadmap-stages">
        {page.stages.map((item) => (
          <section key={item.anchor} id={item.anchor}>
            <header>
              <div>
                <code>{item.status.label || item.status.kind}</code>
                <h2>{item.title}</h2>
              </div>
              <Status status={item.status} locale={locale} />
            </header>
            <ul>
              {item.items.map((entry) => (
                <li key={`${entry.id}:${entry.text}`}>
                  <code>{entry.id}</code>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {page.risks.length > 0 && (
        <section className="roadmap-risks">
          <h2>{text('risks')}</h2>
          <ul>
            {page.risks.map((risk) => (
              <li key={risk.id}>
                <code>{risk.id}</code>
                <span>{risk.title}</span>
                <Status status={risk.status} locale={locale} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && (
        <dialog className="roadmap-dialog" open>
          <form onSubmit={(event) => void add(event)}>
            <header>
              <h2>{text('newOutcome')}</h2>
              <button type="button" onClick={() => setOpen(false)}>
                ×
              </button>
            </header>
            <label>
              <span>{text('stage')}</span>
              <select value={stage} onChange={(event) => setStage(event.currentTarget.value)}>
                {page.stages.map((item) => (
                  <option key={item.anchor}>{item.title}</option>
                ))}
              </select>
            </label>
            <label>
              <span>ID</span>
              <input
                required
                pattern="DLV-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*"
                value={id}
                onChange={(event) => setId(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>{text('outcome')}</span>
              <input
                required
                value={wording}
                onChange={(event) => setWording(event.currentTarget.value)}
              />
            </label>
            {notice && <p role="alert">{notice}</p>}
            <div className="workspace-actions">
              <button type="button" onClick={() => setOpen(false)}>
                {text('cancel')}
              </button>
              <button type="submit">{text('add')}</button>
            </div>
          </form>
        </dialog>
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
      content = <HomePage page={page} snapshot={snapshot} locale={locale} />;
      break;
    case 'document':
      content = (
        <>
          <DocumentContent
            document={page.document}
            locale={locale}
            snapshot={snapshot}
            content={
              page.document.type === 'use-case' ? (
                <UseCaseModes key={page.pageId} page={page} snapshot={snapshot} locale={locale}>
                  <DocumentReadingView document={page.document} locale={locale} />
                </UseCaseModes>
              ) : undefined
            }
          />
          <Relations snapshot={snapshot} {...page.relations} locale={locale} />
        </>
      );
      break;
    case 'task':
      content = (
        <>
          <DocumentContent document={page.document} locale={locale} snapshot={snapshot}>
            <TaskActions page={page} snapshot={snapshot} locale={locale} />
            {(page.workItem.dependsOn.length > 0 || page.workItem.moduleId) && (
              <div className="execution-context">
                {page.workItem.dependsOn.length > 0 && (
                  <section>
                    <h2>{text('dependencies')}</h2>
                    <ul className="relations">
                      {page.workItem.dependsOn.map((id) => {
                        const target = snapshot.pages.find(
                          (item) => item.kind === 'task' && item.workItem.id === id,
                        );
                        return (
                          <li key={id}>
                            {target && target.kind === 'task' ? (
                              <DocumentLink
                                snapshot={snapshot}
                                sourcePath={target.document.sourcePath}
                              />
                            ) : (
                              <code>{id}</code>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                {page.workItem.moduleId && (
                  <section>
                    <h2>{text('context')}</h2>
                    <code>{page.workItem.moduleId}</code>
                  </section>
                )}
              </div>
            )}
          </DocumentContent>
          {page.workItem.criteria.length > 0 && (
            <section className="workbench-section">
              <h2>{text('criteria')}</h2>
              <ul className="criteria-list">
                {page.workItem.criteria.map((criterion) => (
                  <li key={`${criterion.line}:${criterion.text}`}>
                    <label>
                      <input type="checkbox" checked={criterion.completed} disabled />{' '}
                      {criterion.text}
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {page.hierarchy.some((node) => node.children.length > 0) && (
            <TaskTree snapshot={snapshot} nodes={page.hierarchy} locale={locale} />
          )}
          <Relations snapshot={snapshot} {...page.relations} locale={locale} />
        </>
      );
      break;
    case 'catalog':
      content = <CatalogPage page={page} snapshot={snapshot} locale={locale} />;
      break;
    case 'processes':
      content = <ProcessesPage page={page} snapshot={snapshot} locale={locale} />;
      break;
    case 'screens':
      content = (
        <>
          <h1>{text('screens')}</h1>
          <ScreenMap page={page} snapshot={snapshot} locale={locale} />
        </>
      );
      break;
    case 'traceability': {
      content = <TraceabilityPage page={page} locale={locale} />;
      break;
    }
    case 'health': {
      content = <HealthPage page={page} snapshot={snapshot} locale={locale} />;
      break;
    }
    case 'search':
      content = <SearchPage page={page} locale={locale} />;
      break;
    case 'roadmap':
      content = <RoadmapPage page={page} snapshot={snapshot} locale={locale} />;
      break;
    case 'changelog':
      content = <DocumentContent document={page.document} locale={locale} snapshot={snapshot} />;
      break;
    case 'task-workspace':
      content = <TaskWorkspace page={page} snapshot={snapshot} locale={locale} />;
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
      content = <ApiDocsWorkspace page={page} locale={locale} />;
      break;
  }
  return (
    <main className={`page page-${page.kind}`} id="main-content" tabIndex={-1}>
      {page.kind !== 'home' && (
        <div className="breadcrumb">
          <PortalLink to="index.html">{snapshot.project.title}</PortalLink>
          <span aria-hidden="true">/</span>
          <span>
            {'document' in page
              ? page.document?.id || page.document?.type
              : page.kind === 'catalog'
                ? page.data.title
                : page.kind === 'task-workspace'
                  ? text('tasks')
                  : page.kind === 'not-found'
                    ? text('notFound')
                    : page.kind === 'api-docs'
                      ? text('apiDocs')
                      : text(page.kind)}
          </span>
        </div>
      )}
      <MermaidEnhancer pageId={page.pageId} locale={locale} />
      {content}
    </main>
  );
}
