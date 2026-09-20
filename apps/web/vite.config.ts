import { defineConfig } from 'vite';
import { browserFixtureHtml, browserFixtureSnapshot } from './tests/browser-fixture.js';

export default defineConfig(({ mode }) => ({
  base: './',
  build:
    mode === 'renderer'
      ? { outDir: 'dist/server', emptyOutDir: false }
      : { manifest: true, outDir: 'dist/client' },
  plugins:
    mode === 'test'
      ? [
          {
            name: 'toudocu-browser-fixture',
            transformIndexHtml(html, context) {
              const path = new URL(context.originalUrl ?? '/', 'http://toudocu.test').pathname;
              const snapshot = JSON.stringify(browserFixtureSnapshot()).replaceAll('<', '\\u003c');
              return html
                .replace(
                  '<div id="root"><p>Portal data is not available.</p></div>',
                  `<div id="root" data-toudocu-prerendered="true">${browserFixtureHtml(path)}</div>`,
                )
                .replace(
                  '<script id="toudocu-portal-data" type="application/json"></script>',
                  `<script id="toudocu-portal-data" type="application/json">${snapshot}</script>`,
                );
            },
          },
        ]
      : [],
}));
