import { BrowserRouter, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import type { PageViewV1, PortalSnapshotV1 } from '@toudocu/contracts';
import { Navigation, Page } from './pages.js';
import type { Locale } from './i18n.js';
import { CurrentOutputPath } from './routing.js';
import { AgentConsoleWorkspace } from './agent-console.js';

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

function Shell({ snapshot, locale }: { snapshot: PortalSnapshotV1; locale: Locale }) {
  const location = useLocation();
  const current = snapshot.routes.find(
    (route) => `/${route.href.replace(/^\/+|\/+$/gu, '')}` === location.pathname,
  );
  return (
    <CurrentOutputPath.Provider value={current?.outputPath ?? 'index.html'}>
      <div className="app-shell">
        <aside className="sidebar">
          <Navigation items={snapshot.navigation.items} locale={locale} />
        </aside>
        {snapshot.capabilities.agentConsole && <AgentConsoleWorkspace locale={locale} />}
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
