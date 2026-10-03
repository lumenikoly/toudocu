import { useContext, useState, type ReactNode } from 'react';
import type { PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { DocumentBody, DocumentLink } from './document.js';
import { translator, type Locale } from './i18n.js';
import { CurrentOutputPath, relativePortalHref } from './routing.js';
import { ScreenMap } from './screen-map.js';

type DocumentPage = Extract<PageViewV1, { kind: 'document' }>;
type ScreensPage = Extract<PageViewV1, { kind: 'screens' }>;
type Screen = ScreensPage['screens'][number];
type Transition = ScreensPage['transitions'][number];
type Mode = 'overview' | 'map' | 'play' | 'links';

function Identity({ id }: { id: string }) {
  return <code>{id}</code>;
}

function Documents({
  title,
  paths,
  snapshot,
}: {
  title?: string;
  paths: readonly string[];
  snapshot: PortalSnapshotV1;
}) {
  if (paths.length === 0) return null;
  return (
    <div>
      {title && <h3>{title}</h3>}
      <ul className="relations">
        {paths.map((path) => (
          <li key={path}>
            <DocumentLink snapshot={snapshot} sourcePath={path} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransitionTable({
  transitions,
  locale,
}: {
  transitions: readonly Transition[];
  locale: Locale;
}) {
  const { text } = translator(locale);
  if (transitions.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>{text('transitionSource')}</th>
          <th>{text('transitionAction')}</th>
          <th>{text('transitionTarget')}</th>
        </tr>
      </thead>
      <tbody>
        {transitions.map((transition) => (
          <tr key={transition.id}>
            <td>
              <Identity id={transition.source} />
            </td>
            <td>
              <Identity id={transition.id} /> {transition.action}
              {transition.condition && <small> · {transition.condition}</small>}
            </td>
            <td>
              <Identity id={transition.target} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PlayMode({
  flow,
  screens,
  transitions,
  snapshot,
  locale,
}: {
  flow: ScreensPage['playableFlows'][number];
  screens: readonly Screen[];
  transitions: readonly Transition[];
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const from = useContext(CurrentOutputPath);
  const [currentScreenId, setCurrentScreenId] = useState(flow.startScreen);
  const [history, setHistory] = useState<string[]>([]);
  const currentScreen = screens.find((screen) => screen.id === currentScreenId);
  const flowTransitions = flow.transitions.flatMap((id) => {
    const transition = transitions.find((item) => item.id === id);
    return transition ? [transition] : [];
  });
  const availableTransitions = flowTransitions.filter(
    (transition) => transition.source === currentScreenId,
  );
  const terminal = flow.terminalScreens.includes(currentScreenId);
  const currentState =
    history.length > 0
      ? flowTransitions.find((transition) => transition.target === currentScreenId)?.state
      : undefined;
  const preview =
    currentScreen?.states.find((state) => state.id === currentState)?.preview ??
    currentScreen?.preview;
  const hotspots = availableTransitions.flatMap((transition) =>
    pageHotspots(flow, transition, snapshot),
  );
  const { text } = translator(locale);

  const move = (transition: Transition) => {
    setHistory((previous) => [...previous, currentScreenId]);
    setCurrentScreenId(transition.target);
  };
  const back = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((value) => value.slice(0, -1));
    setCurrentScreenId(previous);
  };

  return (
    <section className="use-case-mode">
      <h2>{text('play')}</h2>
      <div className="use-case-player">
        <div className="use-case-player-screen">
          <span className="document-identity">{text('screen')}</span>
          {currentScreen ? (
            <DocumentLink snapshot={snapshot} sourcePath={currentScreen.document} />
          ) : (
            <Identity id={currentScreenId} />
          )}
          {preview && (
            <div className="use-case-preview">
              <img
                src={relativePortalHref(from, preview)}
                alt={currentScreen?.title ?? currentScreenId}
              />
              {hotspots.map(({ hotspot, transition }) => (
                <button
                  key={`${transition.id}:${hotspot.x}:${hotspot.y}`}
                  type="button"
                  className="use-case-hotspot"
                  style={{
                    insetInlineStart: `${hotspot.x}%`,
                    insetBlockStart: `${hotspot.y}%`,
                    inlineSize: `${hotspot.width}%`,
                    blockSize: `${hotspot.height}%`,
                  }}
                  aria-label={transition.action}
                  title={transition.action}
                  onClick={() => move(transition)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="use-case-player-actions">
          {availableTransitions.map((transition) => (
            <button key={transition.id} type="button" onClick={() => move(transition)}>
              <Identity id={transition.id} /> {transition.action}
              {transition.condition && <small> · {transition.condition}</small>}
              {transition.message && <small>{transition.message}</small>}
              {transition.error && <small data-status="blocked">{transition.error}</small>}
            </button>
          ))}
          <button type="button" onClick={back} disabled={history.length === 0}>
            {text('previous')}
          </button>
          <button
            type="button"
            onClick={() => {
              setHistory([]);
              setCurrentScreenId(flow.startScreen);
            }}
          >
            {text('restart')}
          </button>
        </div>
        {terminal && flow.result && (
          <p className="use-case-player-result">
            <strong>{text('result')}:</strong> {flow.result}
          </p>
        )}
        {history.length > 0 && (
          <ol className="use-case-history">
            {history.map((id, index) => (
              <li key={`${id}:${index}`}>
                <code>{id}</code>
              </li>
            ))}
            <li aria-current="step">
              <code>{currentScreenId}</code>
            </li>
          </ol>
        )}
      </div>
    </section>
  );
}

function pageHotspots(
  _flow: ScreensPage['playableFlows'][number],
  transition: Transition,
  snapshot: PortalSnapshotV1,
) {
  const screensPage = snapshot.pages.find((item): item is ScreensPage => item.kind === 'screens');
  return (screensPage?.hotspots ?? [])
    .filter(
      (hotspot) => hotspot.transition === transition.id && hotspot.screen === transition.source,
    )
    .map((hotspot) => ({ hotspot, transition }));
}

export function UseCaseModes({
  page,
  snapshot,
  locale,
  children,
}: {
  page: DocumentPage;
  snapshot: PortalSnapshotV1;
  locale: Locale;
  children?: ReactNode;
}) {
  const { text } = translator(locale);
  const useCase = snapshot.knowledge.useCases.find(
    (item) => item.id === page.document.id || item.document === page.document.sourcePath,
  );
  const [mode, setMode] = useState<Mode>('overview');
  if (!useCase) return <>{children}</>;

  const screensPage = snapshot.pages.find((item): item is ScreensPage => item.kind === 'screens');
  const screens = screensPage?.screens ?? [];
  const screenIds = new Set(useCase.screenIds);
  const linkedScreens = screens.filter((screen) => screenIds.has(screen.id));
  const linkedFlows = snapshot.knowledge.flows.filter(
    (flow) => flow.useCaseIds.includes(useCase.id) || useCase.flowIds.includes(flow.id),
  );
  const useCaseFlows =
    screensPage?.playableFlows.filter((flow) => flow.useCase === page.document.id) ?? [];
  const playableFlow = useCaseFlows.find((flow) => flow.valid);
  const playableTransitionIds = new Set(useCaseFlows.flatMap((flow) => flow.transitions));
  const transitions =
    screensPage?.transitions.filter(
      (transition) => transition.useCase === useCase.id || playableTransitionIds.has(transition.id),
    ) ?? [];
  const hasMap = linkedFlows.length > 0 || linkedScreens.length > 0 || transitions.length > 0;
  const hasLinks = Boolean(useCase.moduleId) || linkedFlows.length > 0 || linkedScreens.length > 0;
  const modes: Array<{ id: Mode; label: string; available: boolean }> = [
    { id: 'overview', label: text('overview'), available: true },
    { id: 'map', label: text('map'), available: hasMap },
    { id: 'play', label: text('play'), available: Boolean(playableFlow && screensPage) },
    { id: 'links', label: text('links'), available: hasLinks },
  ];

  return (
    <div className="use-case-modes">
      <nav aria-label={text('useCaseModes')}>
        {modes
          .filter((item) => item.available)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
      </nav>

      {mode === 'overview' && <div className="use-case-overview">{children}</div>}

      {mode === 'map' && hasMap && (
        <section className="use-case-mode">
          <div className="mode-heading">
            <h2>{text('map')}</h2>
          </div>
          {screensPage && (linkedScreens.length > 0 || transitions.length > 0) && (
            <ScreenMap
              page={{
                ...screensPage,
                transitions,
                screens: screens.filter(
                  (screen) =>
                    screenIds.has(screen.id) ||
                    transitions.some(
                      (transition) =>
                        transition.source === screen.id || transition.target === screen.id,
                    ),
                ),
              }}
              initialUseCase={useCase.id}
              snapshot={snapshot}
              locale={locale}
            />
          )}
          {linkedFlows.length > 0 && (
            <details open>
              <summary>{text('processes')}</summary>
              {linkedFlows.map((flow) => {
                const flowPage = snapshot.pages.find(
                  (item) => item.kind === 'document' && item.document.sourcePath === flow.document,
                );
                return (
                  <section className="linked-flow" key={flow.id}>
                    <h3>
                      <DocumentLink snapshot={snapshot} sourcePath={flow.document} />
                    </h3>
                    {flowPage?.kind === 'document' && (
                      <DocumentBody document={flowPage.document} locale={locale} />
                    )}
                  </section>
                );
              })}
            </details>
          )}
          <details className="flow-data">
            <summary>{text('transitionTable')}</summary>
            <TransitionTable transitions={transitions} locale={locale} />
          </details>
        </section>
      )}

      {mode === 'play' && playableFlow && screensPage && (
        <PlayMode
          flow={playableFlow}
          screens={screensPage.screens}
          transitions={screensPage.transitions}
          snapshot={snapshot}
          locale={locale}
        />
      )}

      {mode === 'links' && hasLinks && (
        <section className="use-case-mode">
          <h2>{text('links')}</h2>
          {useCase.moduleId && (
            <p>
              <Identity id={useCase.moduleId} />
            </p>
          )}
          <Documents
            title={text('processes')}
            paths={linkedFlows.map((flow) => flow.document)}
            snapshot={snapshot}
          />
          <Documents
            title={text('screens')}
            paths={linkedScreens.map((screen) => screen.document)}
            snapshot={snapshot}
          />
        </section>
      )}
    </div>
  );
}
