import { createRoot, hydrateRoot } from 'react-dom/client';
import { PortalApp } from './root.js';
import { ServeApiDataSource, StaticBrowserDataSource } from './data.js';
import './styles/app.css';
import './styles/document.css';

async function start(): Promise<void> {
  const root = document.querySelector('#root');
  if (!(root instanceof HTMLElement)) {
    throw new Error('Portal root is missing');
  }
  const mode = document.documentElement.dataset.toudocuMode;
  const route = document.documentElement.dataset.toudocuRoute ?? 'index.html';
  const routeSuffix =
    route === 'index.html' && !location.pathname.endsWith('/index.html') ? '' : route;
  const basename =
    mode === 'serve'
      ? (document.documentElement.dataset.toudocuBase ?? '/')
      : routeSuffix
        ? location.pathname.slice(0, -routeSuffix.length).replace(/\/$/u, '') || '/'
        : location.pathname.replace(/\/$/u, '') || '/';
  document.documentElement.dataset.toudocuBase = basename;
  const source = mode === 'serve' ? new ServeApiDataSource() : new StaticBrowserDataSource();
  const snapshot = await source.load();
  const app = (
    <PortalApp
      snapshot={snapshot}
      locale={document.documentElement.lang === 'ru' ? 'ru' : 'en'}
      basename={basename}
    />
  );
  if (root.dataset.toudocuPrerendered === 'true') {
    hydrateRoot(root, app);
  } else {
    createRoot(root).render(app);
  }
}

void start().catch((error: unknown) => {
  document.querySelector('#root')?.setAttribute('data-portal-error', 'true');
  console.error(error);
});
