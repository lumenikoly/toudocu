import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { BrowserRouter, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import type { NavigationItem, PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { Page } from './pages.js';
import { Navigation } from './navigation.js';
import { translator, type Locale } from './i18n.js';
import { CurrentOutputPath, PortalLink } from './routing.js';
import { AgentConsoleWorkspace } from './agent-console.js';
import { DiscussionPanel } from './discussions.js';
import { GlobalSearch } from './global-search.js';
import { Icon, IconButton } from './ui/index.js';

export interface PortalAppProps {
  snapshot: PortalSnapshotV1;
  locale?: Locale;
  basename?: string;
  initialPath?: string;
}

function routePath(href: string): string {
  const path = href.split(/[?#]/u, 1)[0]?.replace(/^\/+|\/+$/gu, '') ?? '';
  return href.endsWith('/') ? `${path}/*` : path;
}

function flattenNavigation(items: PortalSnapshotV1['navigation']['items']): NavigationItem[] {
  return items.flatMap((item) => [item, ...flattenNavigation(item.children)]);
}

function workspaceLink(
  items: PortalSnapshotV1['navigation']['items'],
  pageId: string,
): NavigationItem | undefined {
  return flattenNavigation(items).find((item) => item.pageId === pageId);
}

type Appearance = NonNullable<PortalSnapshotV1['appearance']>;
const appearanceValues = {
  theme: ['classic', 'paper', 'terminal'],
  colorScheme: ['light', 'dark', 'system'],
  accent: ['indigo', 'blue', 'teal', 'green', 'amber', 'rose', 'violet'],
  density: ['compact', 'comfortable'],
} as const;
const appearanceStorage = {
  theme: 'toudocu-site-theme',
  colorScheme: 'toudocu-color-scheme',
  accent: 'toudocu-accent',
  density: 'toudocu-density',
} as const;

function AppearanceControls({
  defaults,
  locale,
}: {
  defaults?: Appearance | undefined;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const fallback: Appearance = defaults ?? {
    theme: 'classic',
    colorScheme: 'system',
    accent: 'indigo',
    density: 'comfortable',
    logo: '',
    artwork: '',
  };
  const [appearance, setAppearance] = useState(fallback);
  useEffect(() => {
    const stored = { ...fallback };
    for (const key of ['theme', 'colorScheme', 'accent', 'density'] as const) {
      try {
        const value =
          localStorage.getItem(appearanceStorage[key]) ?? localStorage.getItem(`toudocu-${key}`);
        if (value && (appearanceValues[key] as readonly string[]).includes(value))
          Object.assign(stored, { [key]: value });
      } catch {
        /* Browser storage can be unavailable; project defaults still apply. */
      }
    }
    setAppearance(stored);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.siteTheme = appearance.theme;
    root.dataset.colorScheme = appearance.colorScheme;
    root.dataset.accent = appearance.accent;
    root.dataset.density = appearance.density;
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : undefined;
    const applyScheme = (): void => {
      root.dataset.theme =
        appearance.colorScheme === 'system'
          ? (media?.matches ?? false)
            ? 'dark'
            : 'light'
          : appearance.colorScheme;
    };
    applyScheme();
    if (appearance.colorScheme === 'system') media?.addEventListener('change', applyScheme);
    return () => media?.removeEventListener('change', applyScheme);
  }, [appearance]);
  const set = <K extends 'theme' | 'colorScheme' | 'accent' | 'density'>(
    key: K,
    value: Appearance[K],
  ) => {
    try {
      localStorage.setItem(appearanceStorage[key], value);
    } catch {
      /* Keep in-memory preferences usable. */
    }
    setAppearance((current) => ({ ...current, [key]: value }));
  };
  return (
    <div className="appearance-controls">
      <label>
        <span>{text('style')}</span>
        <select
          value={appearance.theme}
          onChange={(event) => set('theme', event.currentTarget.value as Appearance['theme'])}
        >
          <option value="classic">{text('classicTheme')}</option>
          <option value="paper">{text('paperTheme')}</option>
          <option value="terminal">{text('terminalTheme')}</option>
        </select>
      </label>
      <label>
        <span>{text('theme')}</span>
        <select
          value={appearance.colorScheme}
          onChange={(event) =>
            set('colorScheme', event.currentTarget.value as Appearance['colorScheme'])
          }
        >
          <option value="system">{text('systemTheme')}</option>
          <option value="light">{text('lightTheme')}</option>
          <option value="dark">{text('darkTheme')}</option>
        </select>
      </label>
      <label>
        <span>{text('accent')}</span>
        <select
          value={appearance.accent}
          onChange={(event) => set('accent', event.currentTarget.value as Appearance['accent'])}
        >
          {['indigo', 'blue', 'teal', 'green', 'amber', 'rose', 'violet'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label>
        <span>{text('interfaceDensity')}</span>
        <select
          value={appearance.density}
          onChange={(event) => set('density', event.currentTarget.value as Appearance['density'])}
        >
          <option value="comfortable">{text('comfortableDensity')}</option>
          <option value="compact">{text('compactDensity')}</option>
        </select>
      </label>
    </div>
  );
}

function RebuildButton({ locale }: { locale: Locale }) {
  const { text } = translator(locale);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const rebuild = async (_event: FormEvent): Promise<void> => {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/_toudocu/api/rebuild', {
        method: 'POST',
        headers: { 'x-toudocu-action': 'rebuild' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };
  return (
    <>
      <button
        className="header-icon-button"
        type="button"
        disabled={busy}
        onClick={(event) => void rebuild(event)}
        title={text('rebuildProject')}
        aria-label={text('rebuildProject')}
      >
        {text('rebuildProject')}
      </button>
      {notice && (
        <span className="header-error" role="alert">
          {notice}
        </span>
      )}
    </>
  );
}

function RevisionNotice({ locale }: { locale: Locale }) {
  const { text } = translator(locale);
  const baseline = useRef<number | undefined>(undefined);
  const [state, setState] = useState<{
    revision: number;
    rebuilding: boolean;
    lastError?: string;
  }>();
  useEffect(() => {
    const poll = (): void => {
      void fetch('/_toudocu/api/state', { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
        .then((value: { revision: number; rebuilding: boolean; lastError?: string }) => {
          baseline.current ??= value.revision;
          setState(value);
        })
        .catch(() => undefined);
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => window.clearInterval(timer);
  }, []);
  if (!state) return null;
  if (state.lastError) return <span className="header-error">{state.lastError}</span>;
  if (state.rebuilding) return <span className="revision-notice">{text('rebuilding')}</span>;
  if (baseline.current !== undefined && state.revision > baseline.current)
    return (
      <button className="revision-notice" type="button" onClick={() => location.reload()}>
        {text('projectUpdated')} · {text('reload')}
      </button>
    );
  return null;
}

function Shell({ snapshot, locale }: { snapshot: PortalSnapshotV1; locale: Locale }) {
  const [toolView, setToolView] = useState<'agent' | 'terminal' | null>(null);
  useEffect(() => {
    if (toolView) document.dispatchEvent(new Event('toudocu:discussions-close'));
  }, [toolView]);
  useEffect(() => {
    const closeTools = (): void => setToolView(null);
    document.addEventListener('toudocu:discussion-compose', closeTools);
    document.addEventListener('toudocu:discussions-open', closeTools);
    return () => {
      document.removeEventListener('toudocu:discussion-compose', closeTools);
      document.removeEventListener('toudocu:discussions-open', closeTools);
    };
  }, []);
  const location = useLocation();
  const { text } = translator(locale);
  const navigation = useRef<HTMLDetailsElement>(null);
  const previousPath = useRef(location.pathname);
  const [sidebarWidth, setSidebarWidth] = useState(272);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const workspaceItems = [
    workspaceLink(snapshot.navigation.items, 'home'),
    workspaceLink(snapshot.navigation.items, 'editor'),
    workspaceLink(snapshot.navigation.items, 'changes'),
  ].filter((item): item is NavigationItem => item !== undefined);
  useEffect(() => {
    if (navigation.current) navigation.current.open = false;
    if (previousPath.current !== location.pathname) {
      document.getElementById('main-content')?.focus({ preventScroll: true });
      document.documentElement.scrollTop = 0;
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);
  useEffect(() => {
    const stored = Number(localStorage.getItem('toudocu-sidebar-width'));
    if (stored >= 220 && stored <= 440) setSidebarWidth(stored);
  }, []);
  const resizeSidebar = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeStart.current = { x: event.clientX, width: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const saveSidebarWidth = (width: number): void => {
    const bounded = Math.min(440, Math.max(220, width));
    setSidebarWidth(bounded);
    localStorage.setItem('toudocu-sidebar-width', String(bounded));
  };
  const current = snapshot.routes.find(
    (route) =>
      `/${route.href.replace(/^\/+|\/+$/gu, '')}` ===
      (location.pathname.replace(/\/+$/u, '') || '/'),
  );
  return (
    <CurrentOutputPath.Provider value={current?.outputPath ?? 'index.html'}>
      <div
        className="app-shell"
        data-workspace={
          ['changes', 'editor', 'discussions'].includes(current?.pageId ?? '') || undefined
        }
        style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        <a className="skip-link" href="#main-content">
          {text('skip')}
        </a>
        <header className="site-header">
          <PortalLink className="site-brand" to="index.html" label={snapshot.project.title}>
            <span className="site-brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 3v18M5 7h14M5 12h10M5 17h14" />
              </svg>
            </span>
            <span className="site-brand-copy">
              <strong>{snapshot.project.title}</strong>
              <small>{text('projectLabel')}</small>
            </span>
          </PortalLink>
          <GlobalSearch snapshot={snapshot} locale={locale} />
          <nav className="workspace-tabs" aria-label={text('workspaceNavigation')}>
            {workspaceItems.map((item) => (
              <PortalLink key={item.id} to={item.href}>
                {item.pageId === 'home'
                  ? text('portal')
                  : item.pageId === 'editor'
                    ? text('editor')
                    : text('changes')}
              </PortalLink>
            ))}
          </nav>
          <div className="header-tools">
            {snapshot.capabilities.rebuild && <RevisionNotice locale={locale} />}
            {snapshot.capabilities.agentConsole && (
              <div className="header-tool-group">
                <IconButton
                  id="agent-console-toggle"
                  className="agent-console-toggle"
                  aria-label={text('agentMode')}
                  title={text('agentMode')}
                  aria-controls="agent-console-panel"
                  aria-expanded={toolView === 'agent'}
                  onClick={() => setToolView(toolView === 'agent' ? null : 'agent')}
                >
                  <Icon name="messageSquare" />
                </IconButton>
                <IconButton
                  aria-label={text('consoleTerminal')}
                  title={text('consoleTerminal')}
                  aria-controls="agent-console-panel"
                  aria-expanded={toolView === 'terminal'}
                  onClick={() => setToolView(toolView === 'terminal' ? null : 'terminal')}
                >
                  <Icon name="terminal" />
                </IconButton>
              </div>
            )}
            <button
              className="header-icon-button"
              type="button"
              popoverTarget="workspace-settings"
              title={text('workspaceSettings')}
              aria-label={text('workspaceSettings')}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1.5" />
                <circle cx="12" cy="12" r="1.5" />
                <circle cx="19" cy="12" r="1.5" />
              </svg>
            </button>
            <div id="workspace-settings" className="header-settings" popover="auto">
              <h2>{text('workspaceSettings')}</h2>
              <AppearanceControls defaults={snapshot.appearance} locale={locale} />
              <div className="header-settings-actions">
                {snapshot.capabilities.discussions && (
                  <button
                    type="button"
                    onClick={() => {
                      document.getElementById('workspace-settings')?.hidePopover();
                      document.dispatchEvent(new Event('toudocu:discussions-open'));
                    }}
                  >
                    {text('discussions')}
                  </button>
                )}
                <button type="button" onClick={() => window.print()}>
                  {text('print')}
                </button>
                {snapshot.capabilities.rebuild && <RebuildButton locale={locale} />}
              </div>
            </div>
          </div>
        </header>
        <aside className="sidebar">
          <div className="sidebar-context">
            <span>{text('projectMapLabel')}</span>
            <strong>{snapshot.project.title}</strong>
          </div>
          <details className="navigation-disclosure" ref={navigation}>
            <summary>{text('menu')}</summary>
            <Navigation
              items={snapshot.navigation.items}
              routes={snapshot.routes}
              locale={locale}
            />
          </details>
          <div className="sidebar-footer">
            <span>Toudocu</span>
            <code>{snapshot.generator.version}</code>
          </div>
          <button
            className="sidebar-resizer"
            type="button"
            role="separator"
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={440}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            aria-label={text('resizeNavigation')}
            onPointerDown={resizeSidebar}
            onPointerMove={(event) => {
              const start = resizeStart.current;
              if (start) saveSidebarWidth(start.width + event.clientX - start.x);
            }}
            onPointerUp={(event) => {
              resizeStart.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }
            }}
            onPointerCancel={() => {
              resizeStart.current = null;
            }}
            onLostPointerCapture={() => {
              resizeStart.current = null;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                saveSidebarWidth(sidebarWidth + (event.key === 'ArrowRight' ? 16 : -16));
              }
            }}
          />
        </aside>
        {snapshot.capabilities.agentConsole && (
          <AgentConsoleWorkspace locale={locale} view={toolView} onViewChange={setToolView} />
        )}
        {snapshot.capabilities.discussions && <DiscussionPanel locale={locale} />}
        <Outlet />
      </div>
    </CurrentOutputPath.Provider>
  );
}

function PortalRoutes({ snapshot, locale }: { snapshot: PortalSnapshotV1; locale: Locale }) {
  const home = snapshot.pages.find((page) => page.kind === 'home');
  const notFound = snapshot.pages.find((page) => page.kind === 'not-found');
  const render = (page: PageViewV1) => <Page page={page} snapshot={snapshot} locale={locale} />;
  return (
    <Routes>
      <Route element={<Shell snapshot={snapshot} locale={locale} />}>
        {home && <Route index element={render(home)} />}
        {snapshot.pages.map((page) => (
          <Route key={page.pageId} path={routePath(page.route.href)} element={render(page)} />
        ))}
        {notFound && <Route path="*" element={render(notFound)} />}
      </Route>
    </Routes>
  );
}

export function PortalApp({
  snapshot,
  locale = 'en',
  basename = '/',
  initialPath,
}: PortalAppProps) {
  const routes = <PortalRoutes snapshot={snapshot} locale={locale} />;
  return initialPath === undefined ? (
    <BrowserRouter basename={basename}>{routes}</BrowserRouter>
  ) : (
    <MemoryRouter basename={basename} initialEntries={[initialPath]}>
      {routes}
    </MemoryRouter>
  );
}
