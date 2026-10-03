import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { DocumentLink } from './document.js';
import { translator, type Locale } from './i18n.js';

export function ProjectTopology({
  snapshot,
  locale,
}: {
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const modules = snapshot.knowledge.modules.filter(
    (module) => module.useCaseIds.length || module.screenIds.length,
  );
  if (!modules.length) return null;

  const tasks = snapshot.pages.filter(
    (page): page is Extract<(typeof snapshot.pages)[number], { kind: 'task' }> =>
      page.kind === 'task' && !page.workItem.archived,
  );
  return (
    <section className="project-topology" aria-labelledby="project-topology-title">
      <header className="section-heading">
        <div>
          <h2 id="project-topology-title">{text('projectMap')}</h2>
        </div>
        <span>{text('topologySummary')}</span>
      </header>
      <div className="topology-canvas">
        {modules.slice(0, 5).map((module) => {
          const useCases = snapshot.knowledge.useCases.filter(
            (item) => item.moduleId === module.id,
          );
          const moduleTasks = tasks.filter((page) => page.workItem.moduleId === module.id);
          return (
            <div className="topology-branch" key={module.id}>
              <div className="topology-node topology-module">
                <span className="topology-kind">MODULE</span>
                <DocumentLink snapshot={snapshot} sourcePath={module.document} />
                <small>
                  {useCases.length} UC · {module.screenIds.length} SC
                </small>
              </div>
              <div className="topology-children">
                {useCases.slice(0, 3).map((useCase) => (
                  <div className="topology-node" key={useCase.id}>
                    <span className="topology-kind">USE CASE</span>
                    <DocumentLink snapshot={snapshot} sourcePath={useCase.document} />
                  </div>
                ))}
                {moduleTasks.slice(0, 2).map((task) => (
                  <div className="topology-node topology-task" key={task.pageId}>
                    <span className="topology-kind">WORK</span>
                    <DocumentLink snapshot={snapshot} sourcePath={task.document.sourcePath} />
                  </div>
                ))}
                {useCases.length + moduleTasks.length > 5 && (
                  <span className="topology-more">+{useCases.length + moduleTasks.length - 5}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
