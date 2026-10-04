import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { DocumentLink } from './document.js';
import { translator, type Locale } from './i18n.js';
import { Icon } from './ui/index.js';

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

  return (
    <section className="project-topology" aria-labelledby="project-topology-title">
      <header className="section-heading">
        <div>
          <h2 id="project-topology-title">{text('projectMap')}</h2>
        </div>
        <span className="topology-summary">
          {modules.length} {text('moduleLabel')} ·{' '}
          {modules.reduce((count, module) => count + module.useCaseIds.length, 0)}{' '}
          {text('useCases')}
        </span>
      </header>
      <div className="topology-canvas">
        {modules.map((module) => {
          const useCases = snapshot.knowledge.useCases.filter(
            (item) => item.moduleId === module.id,
          );
          return (
            <div className="topology-branch" key={module.id}>
              <div className="topology-node topology-module">
                <Icon name="layers" />
                <DocumentLink snapshot={snapshot} sourcePath={module.document} />
                <small>
                  {useCases.length} {text('useCases')} · {module.screenIds.length}{' '}
                  {text('screensCount')}
                </small>
              </div>
              <div className="topology-children">
                {useCases.slice(0, 3).map((useCase) => (
                  <div className="topology-node" key={useCase.id}>
                    <Icon name="route" />
                    <DocumentLink snapshot={snapshot} sourcePath={useCase.document} />
                  </div>
                ))}
                {useCases.length > 3 && (
                  <details className="topology-more">
                    <summary>
                      {text('details')} · {useCases.length - 3}
                    </summary>
                    {useCases.slice(3).map((useCase) => (
                      <div className="topology-node" key={useCase.id}>
                        <Icon name="route" />
                        <DocumentLink snapshot={snapshot} sourcePath={useCase.document} />
                      </div>
                    ))}
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
