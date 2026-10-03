import { renderToStaticMarkup } from 'react-dom/server';
import { PortalApp } from '../app/root.js';
import { portalFixture } from './fixture.js';

export function browserFixtureSnapshot() {
  return portalFixture();
}

export function browserFixtureHtml(path: string): string {
  return renderToStaticMarkup(
    <PortalApp snapshot={browserFixtureSnapshot()} initialPath={path} locale="en" />,
  );
}
