import { useContext } from 'react';
import type { PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { CurrentOutputPath, PortalLink, relativePortalHref } from './routing.js';
import { DocumentBody, DocumentLink, EntityIdentity, Status, documentTitle } from './document.js';
import { ProjectTopology } from './knowledge-graph.js';

function knowledgeSections(snapshot: PortalSnapshotV1) {
  const groups = new Map<string, { title: string; href: string; count: number }>();
  for (const page of snapshot.pages) {
    if (page.kind !== 'document' && page.kind !== 'task') continue;
    const directory = page.document.sourcePath.split('/')[0];
    if (!directory || !page.document.sourcePath.includes('/') || directory === 'work') continue;
    const group = groups.get(directory) ?? { title: directory, href: page.route.href, count: 0 };
    group.count += 1;
    if (
      page.document.sourcePath === `${directory}/index.md` ||
      page.document.sourcePath === `${directory}/overview.md`
    ) {
      group.title = documentTitle(page.document);
      group.href = page.route.href;
    }
    groups.set(directory, group);
  }
  return [...groups];
}

export function HomePage({
  page,
  snapshot,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'home' }>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const from = useContext(CurrentOutputPath);
  const tasks = snapshot.pages
    .filter(
      (item): item is Extract<PageViewV1, { kind: 'task' }> =>
        item.kind === 'task' &&
        !item.workItem.archived &&
        !['done', 'cancelled'].includes(item.workItem.status.kind),
    )
    .sort((left, right) => {
      const order: Record<string, number> = { 'in-progress': 0, blocked: 1, ready: 2, draft: 3 };
      return (order[left.workItem.status.kind] ?? 4) - (order[right.workItem.status.kind] ?? 4);
    });
  const activeWork = page.currentStatus.activeWork ?? [];
  const sections = knowledgeSections(snapshot);
  const health = snapshot.routes.find((route) => route.kind === 'health');
  const taskRoute = snapshot.routes.find((route) => route.kind === 'task-workspace');
  return (
    <>
      <header className="project-header project-header--home">
        {snapshot.appearance?.logo && (
          <img
            className="project-logo"
            src={relativePortalHref(from, snapshot.appearance.logo)}
            alt=""
          />
        )}
        <div>
          <h1>{page.project.title}</h1>
          {!page.document && page.project.description && <p>{page.project.description}</p>}
          <div className="project-meta">
            <span>
              {text('documents')} <strong>{page.stats.documents}</strong>
            </span>
            {page.project.updated && (
              <span>
                {text('updated')} <time>{page.project.updated}</time>
              </span>
            )}
          </div>
        </div>
        {snapshot.appearance?.artwork && (
          <img
            className="project-artwork"
            src={relativePortalHref(from, snapshot.appearance.artwork)}
            alt=""
          />
        )}
      </header>
      {page.document && (
        <details className="project-about project-about--home" open>
          <summary>{text('about')}</summary>
          <DocumentBody document={page.document} locale={locale} />
        </details>
      )}
      <section className="workbench-section">
        <div className="section-heading">
          <h2>{text('currentWork')}</h2>
          {taskRoute && <PortalLink to={taskRoute.href}>{text('allTasks')}</PortalLink>}
        </div>
        <ul className="entity-list">
          {tasks.length
            ? tasks.slice(0, 6).map((task) => (
                <li key={task.pageId}>
                  <PortalLink to={task.route.href}>
                    <EntityIdentity document={task.document} />
                    <Status status={task.document.status} locale={locale} />
                  </PortalLink>
                </li>
              ))
            : activeWork.slice(0, 6).map((item) => (
                <li key={item.id}>
                  <DocumentLink snapshot={snapshot} sourcePath={item.document} />
                  <Status status={item.status} locale={locale} />
                </li>
              ))}
        </ul>
        {tasks.length === 0 && activeWork.length === 0 && (
          <p className="empty-note">{text('noActiveWork')}</p>
        )}
      </section>
      <ProjectTopology snapshot={snapshot} locale={locale} />
      <div className="workbench-columns">
        <section className="workbench-section">
          <div className="section-heading">
            <h2>{text('knowledge')}</h2>
            <span>{text('documents')}</span>
          </div>
          <ul className="knowledge-list">
            {sections.map(([id, section]) => {
              return (
                <li key={id}>
                  <PortalLink to={section.href}>
                    <span>
                      {section.title === id ? translator(locale).sectionTitle(id) : section.title}
                    </span>
                    <span className="count">{section.count}</span>
                  </PortalLink>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="workbench-section">
          <div className="section-heading">
            <h2>{text('health')}</h2>
            {health && <PortalLink to={health.href}>{text('issues')}</PortalLink>}
          </div>
          <dl className="health-list">
            <div>
              <dt>{text('documents')}</dt>
              <dd data-state={page.stats.errors ? 'danger' : 'success'}>
                {text(page.stats.errors ? 'review' : 'valid')}
              </dd>
            </div>
            {(
              [
                ['errors', page.stats.errors],
                ['warnings', page.stats.warnings],
                ['stale', page.stats.staleDocuments],
                ['brokenLinks', page.stats.brokenLinks],
              ] as const
            ).map(([key, count]) => (
              <div key={key}>
                <dt>{text(key)}</dt>
                <dd data-state={count ? 'warning' : undefined}>{count}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
