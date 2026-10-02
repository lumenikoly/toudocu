// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalApp } from '../app/root.js';
import { insertRoadmapItem } from '../app/pages.js';
import { portalFixture } from './fixture.js';

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), run: vi.fn(async () => undefined) },
}));

afterEach(cleanup);

describe('portal application', () => {
  it('inserts roadmap outcomes into the selected stage', () => {
    const source =
      '# Roadmap\n\n## Next\n\n- [ ] DLV-001 First\n\n## Later\n\n- [ ] DLV-002 Second\n';

    expect(insertRoadmapItem(source, 'Next', 'dlv-003', 'Third')).toContain(
      '- [ ] DLV-003 Third\n\n## Later',
    );
    expect(insertRoadmapItem(source, 'Later', 'dlv-004', 'Fourth')).toContain(
      '- [ ] DLV-004 Fourth\n',
    );
  });

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

    await user.click(screen.getByText('About the project'));
    await user.click(screen.getAllByRole('link', { name: 'Deep guide' }).at(-1)!);

    expect(screen.getByRole('heading', { name: 'Deep guide' })).toBeTruthy();
    expect(screen.getByText('Useful searchable material.')).toBeTruthy();
  });

  it('navigates to absolute serve routes without changing origin', async () => {
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture('serve')} initialPath="/" locale="en" />);

    await user.click(screen.getByText('Navigation', { selector: 'summary' }));
    await user.click(screen.getByRole('link', { name: 'Editor' }));

    expect(screen.getByRole('heading', { name: 'Editor' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Editor', hidden: true }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('filters the precomputed search index and keeps project content untranslated', async () => {
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture()} initialPath="/search.html" locale="ru" />);

    expect(screen.getByRole('heading', { name: 'Поиск' })).toBeTruthy();
    await user.type(screen.getByRole('textbox'), 'Deep');
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Deep guide' })).toBeTruthy();
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

  it('shows workbench data and preserves a single title with document identity and TOC', () => {
    const snapshot = portalFixture();
    const home = renderToStaticMarkup(<PortalApp snapshot={snapshot} initialPath="/" />);
    expect(home).toContain('Current work');
    expect(home).toContain('TASK-WEB-001');
    expect(home).toContain('Knowledge');
    expect(home).not.toContain('summary-grid');

    render(<PortalApp snapshot={snapshot} initialPath="/work/TASK-WEB-001.html" />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Build web app' })).toBeTruthy();
    const contents = screen.getByRole('navigation', { name: 'On this page' });
    const target = contents.querySelector('a')?.hash.slice(1);
    expect(target && document.getElementById(target)).toBeTruthy();
  });

  it('links navigation group titles to their overview pages', () => {
    render(<PortalApp snapshot={portalFixture()} initialPath="/" locale="en" />);

    expect(screen.getByRole('link', { name: 'Tasks' }).getAttribute('href')).toBe(
      'work/index.html',
    );
  });
});
