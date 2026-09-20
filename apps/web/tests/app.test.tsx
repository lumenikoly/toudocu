// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalApp } from '../app/root.js';
import { portalFixture } from './fixture.js';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), run: vi.fn(async () => undefined) },
}));

afterEach(cleanup);

describe('portal application', () => {
  it('renders useful document content and links without client JavaScript', () => {
    const html = renderToStaticMarkup(
      <PortalApp snapshot={portalFixture()} initialPath="/" locale="en" />,
    );

    expect(html).toContain('Example project');
    expect(html).toContain('Project content stays in English.');
    expect(html).toContain('href="guides/deep.html"');

    const task = renderToStaticMarkup(
      <PortalApp snapshot={portalFixture()} initialPath="/work/TASK-WEB-001.html" locale="en" />,
    );
    const roadmap = renderToStaticMarkup(
      <PortalApp snapshot={portalFixture()} initialPath="/roadmap.html" locale="en" />,
    );
    expect(task).toContain('Build web app');
    expect(roadmap).toContain('Publish the portal.');
  });

  it('lets React Router own document navigation', async () => {
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture()} initialPath="/" locale="en" />);

    await user.click(screen.getAllByRole('link', { name: 'Deep guide' })[1]!);

    expect(screen.getByRole('heading', { name: 'Deep guide' })).toBeTruthy();
    expect(screen.getByText('Useful searchable material.')).toBeTruthy();
  });

  it('navigates to absolute serve routes without changing origin', async () => {
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture('serve')} initialPath="/" locale="en" />);

    await user.click(screen.getByRole('link', { name: 'Editor' }));

    expect(screen.getByRole('heading', { name: 'Editor' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Editor' }).getAttribute('aria-current')).toBe('page');
  });

  it('filters the precomputed search index and keeps project content untranslated', async () => {
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture()} initialPath="/search.html" locale="ru" />);

    expect(screen.getByRole('heading', { name: 'Поиск' })).toBeTruthy();
    await user.type(screen.getByRole('textbox'), 'Deep');
    expect(screen.getAllByRole('link', { name: 'Deep guide' })).toHaveLength(2);
    expect(screen.queryByText('Глубокое руководство')).toBeNull();
  });

  it('enhances validated Mermaid blocks after route rendering', async () => {
    const run = vi.fn(async (_options: { nodes: Element[] }) => undefined);
    (window as Window & { mermaid?: { run: typeof run } }).mermaid = { run };

    render(<PortalApp snapshot={portalFixture()} initialPath="/guides/deep.html" />);

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0]?.[0].nodes).toHaveLength(1);
    delete (window as Window & { mermaid?: unknown }).mermaid;
  });
});
