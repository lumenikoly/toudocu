import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChangeSetReportV1Schema,
  type PageViewV1,
  type PortalSnapshotV1,
} from '@toudocu/contracts';
import { DocumentLink } from './document.js';
import { translator, type Locale } from './i18n.js';
import { CurrentOutputPath, relativePortalHref } from './routing.js';
import { Icon, IconButton } from './ui/index.js';

type ScreensPage = Extract<PageViewV1, { kind: 'screens' }>;
type Screen = ScreensPage['screens'][number];
type Transition = ScreensPage['transitions'][number];

const NODE_WIDTH = 264;
const NODE_HEIGHT = 280;
const COLUMN_GAP = 160;
const ROW_GAP = 112;
const PADDING = 24;

export interface ScreenMapPosition {
  screen: Screen;
  column: number;
  row: number;
  left: number;
  top: number;
}

export interface ScreenMapLayout {
  width: number;
  height: number;
  positions: readonly ScreenMapPosition[];
  groups?: readonly { id: string; left: number; top: number; width: number; height: number }[];
}

/** Keep the diagram deterministic and readable without inventing graph data. */
export function layoutScreenMap(
  screens: readonly Screen[],
  transitions: readonly Transition[],
  grouped = false,
): ScreenMapLayout {
  if (grouped) {
    const members = new Map<string, Screen[]>();
    for (const screen of screens) {
      const key = screen.module;
      members.set(key, [...(members.get(key) ?? []), screen]);
    }
    const positions: ScreenMapPosition[] = [];
    const groups: NonNullable<ScreenMapLayout['groups']>[number][] = [];
    let left = PADDING;
    for (const [id, items] of members) {
      const columns = Math.min(2, items.length);
      const rows = Math.ceil(items.length / columns);
      const width = PADDING * 2 + columns * NODE_WIDTH + (columns - 1) * COLUMN_GAP;
      const height = PADDING * 3 + rows * NODE_HEIGHT + (rows - 1) * ROW_GAP;
      groups.push({ id, left, top: PADDING, width, height });
      items.forEach((screen, index) =>
        positions.push({
          screen,
          column: Math.floor(left / NODE_WIDTH) + (index % columns),
          row: Math.floor(index / columns),
          left: left + PADDING + (index % columns) * (NODE_WIDTH + COLUMN_GAP),
          top: PADDING * 3 + Math.floor(index / columns) * (NODE_HEIGHT + ROW_GAP),
        }),
      );
      left += width + COLUMN_GAP;
    }
    return {
      positions,
      groups,
      width: Math.max(720, left - COLUMN_GAP + PADDING),
      height: Math.max(320, ...groups.map((group) => group.top + group.height + PADDING)),
    };
  }
  const ids = new Set(screens.map((screen) => screen.id));
  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const transition of transitions) {
    if (!ids.has(transition.source) || !ids.has(transition.target)) continue;
    outgoing.set(transition.source, [
      ...(outgoing.get(transition.source) ?? []),
      transition.target,
    ]);
    incoming.add(transition.target);
  }

  const levels = new Map<string, number>();
  const queue = screens.filter((screen) => !incoming.has(screen.id)).map((screen) => screen.id);
  for (const id of queue) levels.set(id, 0);
  if (queue.length === 0 && screens[0]) {
    queue.push(screens[0].id);
    levels.set(screens[0].id, 0);
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    const level = levels.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      if (levels.has(target)) continue;
      levels.set(target, level + 1);
      queue.push(target);
    }
  }

  let fallbackLevel = Math.max(0, ...levels.values()) + 1;
  for (const screen of screens) {
    if (!levels.has(screen.id)) levels.set(screen.id, fallbackLevel++);
  }

  const rows = new Map<number, Screen[]>();
  for (const screen of screens) {
    const level = levels.get(screen.id) ?? 0;
    rows.set(level, [...(rows.get(level) ?? []), screen]);
  }
  const maxRows = Math.max(1, ...[...rows.values()].map((items) => items.length));
  const maxColumn = Math.max(0, ...rows.keys());
  const positions = [...rows.entries()].flatMap(([column, items]) =>
    items.map((screen, row) => ({
      screen,
      column,
      row,
      left: PADDING + column * (NODE_WIDTH + COLUMN_GAP),
      top: PADDING + row * (NODE_HEIGHT + ROW_GAP),
    })),
  );
  return {
    width: Math.max(720, PADDING * 2 + (maxColumn + 1) * NODE_WIDTH + maxColumn * COLUMN_GAP),
    height: Math.max(220, PADDING * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP),
    positions,
  };
}

function ScreenStatus({ status, locale }: { status: string; locale: Locale }) {
  return (
    <span className="screen-map-status status" data-status={status}>
      {translator(locale).status(status) || '—'}
    </span>
  );
}

function ConnectionList({
  transitions,
  locale,
}: {
  transitions: readonly Transition[];
  locale: Locale;
}) {
  const { text } = translator(locale);
  const title = text('connections');
  return (
    <details className="screen-map-details" open>
      <summary>{title}</summary>
      {transitions.length > 0 ? (
        <ul className="screen-map-connections">
          {transitions.map((transition) => (
            <li key={transition.id}>
              <span className="screen-map-connection-route">
                <code>{transition.source}</code>
                <span aria-hidden="true">→</span>
                <code>{transition.target}</code>
              </span>
              <span className="screen-map-connection-action">
                <code>{transition.id}</code> {transition.action}
              </span>
              {transition.condition && <small>{transition.condition}</small>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-note">{text('noConnections')}</p>
      )}
    </details>
  );
}

function ScreenNode({
  screen,
  snapshot,
  locale,
  onInspect,
}: {
  screen: Screen;
  snapshot: PortalSnapshotV1;
  locale: Locale;
  onInspect(): void;
}) {
  const { text } = translator(locale);
  const from = useContext(CurrentOutputPath);
  return (
    <article
      className="screen-map-node"
      aria-label={`${screen.id}: ${screen.title}`}
      onClick={onInspect}
      onDoubleClick={(event) => event.currentTarget.querySelector<HTMLAnchorElement>('a')?.click()}
    >
      {screen.preview ? (
        <img
          className="screen-map-preview"
          src={relativePortalHref(from, screen.preview)}
          alt={screen.title}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="screen-map-preview screen-map-preview-empty">
          <Icon name="file" />
          <span>{text('noPreview')}</span>
        </div>
      )}
      <header>
        <code>{screen.id}</code>
        <ScreenStatus status={screen.status} locale={locale} />
        <IconButton
          type="button"
          className="screen-inspect"
          aria-label={`${text('inspect')} ${screen.id}`}
          title={text('inspect')}
          onClick={onInspect}
        >
          <Icon name="plus" />
        </IconButton>
      </header>
      <h3>
        <DocumentLink snapshot={snapshot} sourcePath={screen.document}>
          {screen.title}
        </DocumentLink>
      </h3>
      {screen.route && (
        <p>
          <code>{screen.route}</code>
        </p>
      )}
      {screen.module && (
        <small>
          {text('moduleLabel')} <code>{screen.module}</code>
        </small>
      )}
    </article>
  );
}

export function ScreenMap({
  page,
  snapshot,
  locale,
  initialUseCase = '',
}: {
  page: ScreensPage;
  snapshot: PortalSnapshotV1;
  locale: Locale;
  initialUseCase?: string;
}) {
  const { text } = translator(locale);
  const from = useContext(CurrentOutputPath);
  const workspace = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: 'pan'; id: number; x: number; y: number; left: number; top: number }
    | { kind: 'pinch'; distance: number; zoom: number; contentX: number; contentY: number }
    | null
  >(null);
  const zoomAnchor = useRef<{
    zoom: number;
    x: number;
    y: number;
    contentX: number;
    contentY: number;
  } | null>(null);
  const [mode, setMode] = useState<'all' | 'module' | 'usecase' | 'unfinished' | 'hierarchy'>(
    initialUseCase ? 'usecase' : 'all',
  );
  const [representation, setRepresentation] = useState<'map' | 'table'>('map');
  const [query, setQuery] = useState('');
  const [module, setModule] = useState('');
  const [useCase, setUseCase] = useState(initialUseCase);
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState('');
  const [selectedTransitionId, setSelectedTransitionId] = useState('');
  const [changeStatus, setChangeStatus] = useState('');
  const [zoom, setZoom] = useState(1);
  const [autoFit, setAutoFit] = useState(true);
  const [changesActive, setChangesActive] = useState(false);
  const [changedScreens, setChangedScreens] = useState<Map<string, string>>(new Map());
  const [changeError, setChangeError] = useState('');
  useEffect(() => {
    const viewport = scroller.current;
    const anchor = zoomAnchor.current;
    const canvas = stage.current;
    if (!anchor) return;
    if (!viewport || !canvas || anchor.zoom !== zoom) {
      zoomAnchor.current = null;
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    viewport.scrollLeft += canvasRect.left - viewportRect.left + anchor.contentX * zoom - anchor.x;
    viewport.scrollTop += canvasRect.top - viewportRect.top + anchor.contentY * zoom - anchor.y;
    zoomAnchor.current = null;
  }, [zoom]);
  const visibleScreens = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return page.screens.filter((screen) => {
      if (mode === 'module' && module && screen.module !== module) return false;
      if (
        mode === 'usecase' &&
        useCase &&
        !screen.useCases.includes(useCase) &&
        !snapshot.knowledge.useCases.some(
          (item) => item.id === useCase && item.screenIds.includes(screen.id),
        ) &&
        !page.playableFlows.some(
          (flow) => flow.useCase === useCase && flow.reachableScreens.includes(screen.id),
        ) &&
        !page.transitions.some(
          (transition) =>
            transition.useCase === useCase &&
            (transition.source === screen.id || transition.target === screen.id),
        )
      )
        return false;
      if (mode === 'unfinished' && !['planned', 'in-progress', 'blocked'].includes(screen.status))
        return false;
      if (status && screen.status !== status) return false;
      if (changesActive && !changedScreens.has(screen.id)) return false;
      if (changesActive && changeStatus && changedScreens.get(screen.id) !== changeStatus)
        return false;
      return (
        !needle ||
        `${screen.id} ${screen.title} ${screen.route ?? ''} ${screen.module}`
          .toLocaleLowerCase(locale)
          .includes(needle)
      );
    });
  }, [
    changeStatus,
    changedScreens,
    changesActive,
    locale,
    mode,
    module,
    page.screens,
    page.playableFlows,
    page.transitions,
    snapshot.knowledge.useCases,
    query,
    status,
    useCase,
  ]);
  useEffect(() => {
    const viewport = scroller.current;
    if (!viewport || representation !== 'map' || visibleScreens.length === 0) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const canvas = stage.current;
      if (!canvas) return;
      const rect = viewport.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const next = Math.min(2, Math.max(0.08, zoom * Math.exp(-event.deltaY * 0.002)));
      zoomAnchor.current = {
        zoom: next,
        x,
        y,
        contentX: (event.clientX - canvasRect.left) / zoom,
        contentY: (event.clientY - canvasRect.top) / zoom,
      };
      setAutoFit(false);
      setZoom(next);
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [representation, visibleScreens.length, zoom]);
  const visibleIds = new Set(visibleScreens.map((screen) => screen.id));
  const transitions =
    mode === 'hierarchy'
      ? visibleScreens.flatMap((screen) =>
          screen.parent && visibleIds.has(screen.parent)
            ? [
                {
                  id: `parent:${screen.id}`,
                  source: screen.parent,
                  target: screen.id,
                  action: translator(locale).text('hierarchy'),
                  condition: '',
                  document: screen.document,
                  line: 0,
                  type: 'navigation',
                },
              ]
            : [],
        )
      : page.transitions.filter(
          (transition) =>
            visibleIds.has(transition.source) &&
            visibleIds.has(transition.target) &&
            (mode !== 'usecase' ||
              !useCase ||
              !transition.useCase ||
              transition.useCase === useCase),
        );
  const layout = layoutScreenMap(
    visibleScreens,
    transitions,
    ['all', 'module', 'unfinished'].includes(mode),
  );
  useEffect(() => {
    setAutoFit(true);
  }, [mode, module, useCase, status, query, changesActive, changeStatus]);
  useEffect(() => {
    const viewport = scroller.current;
    if (!viewport || !autoFit || representation !== 'map') return;
    const fit = (): void => {
      if (!viewport.clientWidth || !viewport.clientHeight) return;
      setZoom(
        Math.min(
          1,
          Math.max(
            0.08,
            Math.min(
              (viewport.clientWidth - 32) / layout.width,
              (viewport.clientHeight - 32) / layout.height,
            ),
          ),
        ),
      );
      viewport.scrollTo?.(0, 0);
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [autoFit, layout.width, layout.height, representation]);
  const positionById = new Map(layout.positions.map((position) => [position.screen.id, position]));
  const visibleTransitions = transitions.filter(
    (transition) => positionById.has(transition.source) && positionById.has(transition.target),
  );
  const selectedScreen = page.screens.find((screen) => screen.id === selected);
  const selectedTransition = page.transitions.find(
    (transition) => transition.id === selectedTransitionId,
  );
  const modules = [...new Set(page.screens.map((screen) => screen.module).filter(Boolean))];
  const useCases = [...new Set(page.screens.flatMap((screen) => screen.useCases))];
  const statuses = [...new Set(page.screens.map((screen) => screen.status).filter(Boolean))];
  const toggleChanges = async (): Promise<void> => {
    if (changesActive) return setChangesActive(false);
    setChangeError('');
    try {
      const response = await fetch('/_toudocu/api/changes?base=HEAD&target=working-tree');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const report = ChangeSetReportV1Schema.parse(await response.json());
      const next = new Map<string, string>();
      for (const change of report.changes) {
        if (change.screen?.before?.id) next.set(change.screen.before.id, change.status);
        if (change.screen?.after?.id) next.set(change.screen.after.id, change.status);
        for (const transition of change.screen?.transitions ?? []) {
          for (const value of [transition.before, transition.after]) {
            if (!value) continue;
            next.set(value.source, transition.status);
            next.set(value.target, transition.status);
          }
        }
      }
      setChangedScreens(next);
      setChangesActive(true);
    } catch (reason) {
      setChangeError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <section className="screen-map" aria-labelledby="screen-map-title" ref={workspace}>
      <header className="section-heading screen-map-heading">
        <h2 id="screen-map-title">{text('screenMap')}</h2>
        <div className="workspace-actions">
          <span>
            {page.screens.length} {text('screensCount')} · {page.transitions.length}{' '}
            {text('transitionsCount')}
          </span>
          <button
            type="button"
            aria-pressed={representation === 'map'}
            onClick={() => setRepresentation('map')}
          >
            {text('mapView')}
          </button>
          <button
            type="button"
            aria-pressed={representation === 'table'}
            onClick={() => setRepresentation('table')}
          >
            {text('tableView')}
          </button>
        </div>
      </header>
      <div className="screen-map-toolbar" aria-label={text('mapControls')}>
        <div className="screen-map-modes">
          {(['all', 'module', 'usecase', 'unfinished', 'hierarchy'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              {item === 'all'
                ? text('all')
                : item === 'usecase'
                  ? text('useCaseFilter')
                  : item === 'unfinished'
                    ? text('unfinished')
                    : item === 'hierarchy'
                      ? text('hierarchy')
                      : text('moduleLabel')}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={query}
          placeholder={text('screenFilterPlaceholder')}
          aria-label={text('search')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {mode === 'module' && (
          <select
            aria-label={text('moduleLabel')}
            value={module}
            onChange={(event) => setModule(event.currentTarget.value)}
          >
            <option value="">{text('allModules')}</option>
            {modules.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
        {mode === 'usecase' && (
          <select
            aria-label={text('useCaseFilter')}
            value={useCase}
            onChange={(event) => setUseCase(event.currentTarget.value)}
          >
            <option value="">{text('allUseCases')}</option>
            {useCases.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
        <select
          aria-label={text('status')}
          value={status}
          onChange={(event) => setStatus(event.currentTarget.value)}
        >
          <option value="">{text('allStatuses')}</option>
          {statuses.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        {snapshot.capabilities.changes && (
          <button type="button" aria-pressed={changesActive} onClick={() => void toggleChanges()}>
            {text('showChanges')}
          </button>
        )}
        {changesActive && (
          <select
            aria-label={text('changeStatus')}
            value={changeStatus}
            onChange={(event) => setChangeStatus(event.currentTarget.value)}
          >
            <option value="">{text('allChanges')}</option>
            {[...new Set(changedScreens.values())].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        )}
        <div className="screen-map-zoom">
          <IconButton
            aria-label={text('zoomOut')}
            title={text('zoomOut')}
            onClick={() => {
              setAutoFit(false);
              setZoom((value) => Math.max(0.08, value / 1.2));
            }}
          >
            <Icon name="minus" />
          </IconButton>
          <button
            type="button"
            title={text('resetZoom')}
            onClick={() => {
              setAutoFit(false);
              setZoom(1);
            }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <IconButton
            aria-label={text('zoomIn')}
            title={text('zoomIn')}
            onClick={() => {
              setAutoFit(false);
              setZoom((value) => Math.min(2, value * 1.2));
            }}
          >
            <Icon name="plus" />
          </IconButton>
          <IconButton
            aria-label={text('fitDiagram')}
            title={text('fitDiagram')}
            onClick={() => setAutoFit(true)}
          >
            <Icon name="fit" />
          </IconButton>
          <IconButton
            aria-label={text('fullScreen')}
            title={text('fullScreen')}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else void workspace.current?.requestFullscreen();
            }}
          >
            <Icon name="maximize" />
          </IconButton>
        </div>
      </div>
      {visibleScreens.length > 0 && representation === 'table' ? (
        <div className="data-table screen-catalog-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>{text('screen')}</th>
                <th>{text('moduleLabel')}</th>
                <th>{text('route')}</th>
                <th>{text('status')}</th>
                <th>{text('useCasesLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleScreens.map((screen) => (
                <tr key={screen.id}>
                  <td>
                    <code>{screen.id}</code>
                  </td>
                  <td>
                    <DocumentLink snapshot={snapshot} sourcePath={screen.document}>
                      {screen.title}
                    </DocumentLink>
                  </td>
                  <td>
                    <code>{screen.module || '—'}</code>
                  </td>
                  <td>
                    <code>{screen.route || '—'}</code>
                  </td>
                  <td>
                    <ScreenStatus status={screen.status} locale={locale} />
                  </td>
                  <td>
                    {screen.useCases.map((id) => (
                      <code key={id}>{id}</code>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : visibleScreens.length > 0 ? (
        <div
          className="screen-map-scroll"
          tabIndex={0}
          ref={scroller}
          onPointerDown={(event) => {
            if (event.button !== 0 && event.pointerType !== 'touch') return;
            const viewport = event.currentTarget;
            const point = { x: event.clientX, y: event.clientY };
            pointers.current.set(event.pointerId, point);
            if (pointers.current.size >= 2) {
              const [first, second] = [...pointers.current.values()];
              if (!first || !second) return;
              const rect = viewport.getBoundingClientRect();
              const canvasRect = stage.current?.getBoundingClientRect();
              if (!canvasRect) return;
              const x = (first.x + second.x) / 2 - rect.left;
              const y = (first.y + second.y) / 2 - rect.top;
              gesture.current = {
                kind: 'pinch',
                distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
                zoom,
                contentX: ((first.x + second.x) / 2 - canvasRect.left) / zoom,
                contentY: ((first.y + second.y) / 2 - canvasRect.top) / zoom,
              };
              setAutoFit(false);
              event.preventDefault();
              viewport.setPointerCapture(event.pointerId);
              return;
            }
            const onInteractive =
              event.target instanceof Element &&
              event.target.closest('a, button, path, .screen-map-node, .screen-map-edge-label');
            if (!onInteractive) {
              gesture.current = {
                kind: 'pan',
                id: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                left: viewport.scrollLeft,
                top: viewport.scrollTop,
              };
              event.preventDefault();
              viewport.setPointerCapture(event.pointerId);
            }
          }}
          onPointerMove={(event) => {
            const viewport = event.currentTarget;
            pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const active = gesture.current;
            if (active?.kind === 'pinch' && pointers.current.size >= 2) {
              const [first, second] = [...pointers.current.values()];
              if (!first || !second) return;
              const rect = viewport.getBoundingClientRect();
              const canvasRect = stage.current?.getBoundingClientRect();
              if (!canvasRect) return;
              const x = (first.x + second.x) / 2 - rect.left;
              const y = (first.y + second.y) / 2 - rect.top;
              const next = Math.min(
                2,
                Math.max(
                  0.08,
                  active.zoom *
                    (Math.hypot(first.x - second.x, first.y - second.y) / active.distance),
                ),
              );
              zoomAnchor.current = {
                zoom: next,
                x,
                y,
                contentX: active.contentX,
                contentY: active.contentY,
              };
              setZoom(next);
              event.preventDefault();
            } else if (active?.kind === 'pan' && active.id === event.pointerId) {
              viewport.scrollLeft = active.left - (event.clientX - active.x);
              viewport.scrollTop = active.top - (event.clientY - active.y);
            }
          }}
          onPointerUp={(event) => {
            pointers.current.delete(event.pointerId);
            if (pointers.current.size < 2 && gesture.current?.kind === 'pinch') {
              gesture.current = null;
            } else if (gesture.current?.kind === 'pan' && gesture.current.id === event.pointerId) {
              gesture.current = null;
            }
          }}
          onPointerCancel={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = null;
          }}
          onLostPointerCapture={(event) => {
            pointers.current.delete(event.pointerId);
            gesture.current = null;
          }}
        >
          <div
            className="screen-map-stage"
            ref={stage}
            style={{ inlineSize: layout.width * zoom, blockSize: layout.height * zoom }}
          >
            <div
              className="screen-map-canvas"
              style={{
                inlineSize: layout.width,
                blockSize: layout.height,
                transform: `scale(${zoom})`,
                transformOrigin: 'left top',
              }}
              aria-label={text('projectScreenDiagram')}
            >
              {layout.groups?.map((group) => (
                <div
                  key={group.id}
                  className="screen-map-group"
                  style={{
                    left: group.left,
                    top: group.top,
                    width: group.width,
                    height: group.height,
                  }}
                >
                  <code>{group.id || text('screens')}</code>
                </div>
              ))}
              <svg
                className="screen-map-edges"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                aria-label={text('transitions')}
              >
                <defs>
                  <marker
                    id="screen-map-arrow"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3.5"
                    orient="auto"
                  >
                    <path d="m0 0 7 3.5L0 7Z" />
                  </marker>
                </defs>
                {visibleTransitions.map((transition, index) => {
                  const source = positionById.get(transition.source);
                  const target = positionById.get(transition.target);
                  if (!source || !target) return null;
                  const forward = target.left >= source.left;
                  const startX = source.left + (forward ? NODE_WIDTH : 0);
                  const endX = target.left + (forward ? 0 : NODE_WIDTH);
                  const startY = source.top + NODE_HEIGHT / 2;
                  const endY = target.top + NODE_HEIGHT / 2;
                  const sameColumn = source.column === target.column;
                  const loop = source.screen.id === target.screen.id;
                  const laneX = source.left + NODE_WIDTH + 80 + (index % 3) * 20;
                  const labelX = sameColumn
                    ? source.left + NODE_WIDTH + 8
                    : (startX + endX) / 2 - 70;
                  let labelY = (startY + endY) / 2 - 22;
                  // Keep transition controls in the row gaps, not underneath screen cards.
                  for (const node of [...layout.positions].sort((a, b) => a.top - b.top)) {
                    if (
                      labelX < node.left + NODE_WIDTH &&
                      labelX + 140 > node.left &&
                      labelY < node.top + NODE_HEIGHT &&
                      labelY + 70 > node.top
                    ) {
                      labelY = node.top + NODE_HEIGHT + 12;
                    }
                  }
                  const path = loop
                    ? `M ${source.left + NODE_WIDTH} ${startY - 28} C ${laneX} ${startY - 70}, ${laneX} ${startY + 70}, ${source.left + NODE_WIDTH} ${startY + 28}`
                    : sameColumn
                      ? `M ${source.left + NODE_WIDTH} ${startY} C ${laneX} ${startY}, ${laneX} ${endY}, ${target.left + NODE_WIDTH} ${endY}`
                      : `M ${startX} ${startY} C ${startX + (endX - startX) / 2} ${startY}, ${endX - (endX - startX) / 2} ${endY}, ${endX} ${endY}`;
                  return (
                    <g key={transition.id}>
                      <path
                        key={transition.id}
                        d={path}
                        markerEnd="url(#screen-map-arrow)"
                        data-kind={transition.type}
                        data-selected={selectedTransitionId === transition.id || undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={`${transition.id}: ${transition.source} → ${transition.target}`}
                        onClick={() => setSelectedTransitionId(transition.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedTransitionId(transition.id);
                          }
                        }}
                      />
                      <foreignObject x={labelX} y={labelY} width="140" height="70">
                        <button
                          className="screen-map-edge-label"
                          type="button"
                          onClick={() => setSelectedTransitionId(transition.id)}
                          title={`${transition.id}: ${transition.action}`}
                        >
                          <span>{transition.action || transition.id}</span>
                          {transition.condition && <small>{transition.condition}</small>}
                        </button>
                      </foreignObject>
                    </g>
                  );
                })}
              </svg>
              {layout.positions.map((position) => (
                <div
                  className="screen-map-node-wrap"
                  key={position.screen.id}
                  style={{ insetInlineStart: position.left, insetBlockStart: position.top }}
                  data-selected={selected === position.screen.id || undefined}
                  data-change={changedScreens.get(position.screen.id)}
                >
                  <ScreenNode
                    screen={position.screen}
                    snapshot={snapshot}
                    locale={locale}
                    onInspect={() => setSelected(position.screen.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="empty-note">{text('noScreens')}</p>
      )}
      {changeError && <p role="alert">{changeError}</p>}
      {selectedScreen && (
        <aside className="screen-map-inspector">
          <header>
            <code>{selectedScreen.id}</code>
            <button type="button" onClick={() => setSelected('')} aria-label={text('close')}>
              ×
            </button>
          </header>
          <h3>{selectedScreen.title}</h3>
          {selectedScreen.description && <p>{selectedScreen.description}</p>}
          <dl>
            <div>
              <dt>{text('route')}</dt>
              <dd>
                <code>{selectedScreen.route || '—'}</code>
              </dd>
            </div>
            <div>
              <dt>{text('moduleLabel')}</dt>
              <dd>
                <code>{selectedScreen.module || '—'}</code>
              </dd>
            </div>
            <div>
              <dt>{text('useCasesLabel')}</dt>
              <dd>
                {selectedScreen.useCases.map((id) => (
                  <code key={id}>{id}</code>
                ))}
              </dd>
            </div>
          </dl>
          {selectedScreen.preview && (
            <img
              src={relativePortalHref(from, selectedScreen.preview)}
              alt={selectedScreen.title}
            />
          )}
          <DocumentLink snapshot={snapshot} sourcePath={selectedScreen.document}>
            {text('openDocument')}
          </DocumentLink>
        </aside>
      )}
      {selectedTransition && (
        <aside className="screen-map-inspector transition-inspector">
          <header>
            <strong>{text('transitionDetails')}</strong>
            <button
              type="button"
              onClick={() => setSelectedTransitionId('')}
              aria-label={text('close')}
            >
              ×
            </button>
          </header>
          <code>{selectedTransition.id}</code>
          <p>
            <code>{selectedTransition.source}</code> → <code>{selectedTransition.target}</code>
          </p>
          {selectedTransition.action && <p>{selectedTransition.action}</p>}
          {selectedTransition.condition && (
            <p>
              <strong>{text('condition')}:</strong> {selectedTransition.condition}
            </p>
          )}
          {selectedTransition.state && (
            <p>
              <strong>{text('state')}:</strong> {selectedTransition.state}
            </p>
          )}
          {selectedTransition.error && <p role="alert">{selectedTransition.error}</p>}
        </aside>
      )}
      <ConnectionList transitions={visibleTransitions} locale={locale} />
    </section>
  );
}
