// @vitest-environment jsdom
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalApp } from '../app/root.js';
import { insertRoadmapItem } from '../app/pages.js';
import { portalFixture } from './fixture.js';
import { ApiDocsWorkspace } from '../app/workspaces.js';
import { SwaggerUIBundle } from 'swagger-ui-dist';

vi.mock('swagger-ui-dist', () => ({
  SwaggerUIBundle: Object.assign(vi.fn(), { presets: { apis: {} } }),
}));

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), run: vi.fn(async () => undefined) },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('portal application', () => {
  it('switches the displayed API contract with the single specification selector', async () => {
    const user = userEvent.setup();
    const route = portalFixture().routes[0]!;
    const specs = [
      { path: 'contracts/agent.openapi.yaml', title: 'Agent API', version: '1' },
      { path: 'contracts/editor.openapi.yaml', title: 'Editor API', version: '2' },
    ];
    render(
      <ApiDocsWorkspace
        page={{ kind: 'api-docs', pageId: 'api-docs', route, specs }}
        locale="en"
      />,
    );
    await waitFor(() =>
      expect(SwaggerUIBundle).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('agent.openapi.yaml'),
          layout: 'BaseLayout',
        }),
      ),
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Specification' }),
      specs[1]!.path,
    );
    await waitFor(() =>
      expect(SwaggerUIBundle).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('editor.openapi.yaml'),
          supportedSubmitMethods: ['get', 'head'],
        }),
      ),
    );
    expect(new URLSearchParams(location.search).get('spec')).toBe(specs[1]!.path);
    expect(screen.getByRole('link', { name: 'Open source' }).getAttribute('href')).toContain(
      'editor.openapi.yaml',
    );
  });

  it('keeps the overview collapsed until requested and the portal tab active on documents', async () => {
    const user = userEvent.setup();
    const view = render(<PortalApp snapshot={portalFixture()} initialPath="/" />);
    const about = view.container.querySelector<HTMLDetailsElement>('.project-about')!;
    expect(about.open).toBe(false);
    await user.click(screen.getByText('About the project'));
    expect(about.open).toBe(true);
    await user.click(within(about).getByRole('link', { name: 'Deep guide' }));
    expect(
      within(screen.getByRole('navigation', { name: 'Workspace navigation' }))
        .getByRole('link', { name: 'Portal' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('shows the introduction once when Markdown contains inline markup and entities', () => {
    const snapshot = portalFixture();
    const page = snapshot.pages.find(
      (entry) => entry.kind === 'document' && entry.document.sourcePath === 'guides/deep.md',
    );
    if (!page || page.kind !== 'document') throw new Error('Missing guide fixture');
    page.document.description = 'Useful searchable material & details.';
    page.document.html = '<p>Useful <strong>searchable</strong> material &amp; details.</p>';
    render(<PortalApp snapshot={snapshot} initialPath="/guides/deep.html" />);
    expect(
      screen.getByRole('main').textContent?.match(/Useful searchable material & details\./gu),
    ).toHaveLength(1);
  });

  it('keeps navigation and resizing usable when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const user = userEvent.setup();
    render(<PortalApp snapshot={portalFixture()} initialPath="/" />);
    await user.click(screen.getByText('Navigation', { selector: 'summary' }));
    await user.click(screen.getByRole('link', { name: 'Tasks' }));
    expect(screen.getByRole('main')).toBeTruthy();
    const resizer = screen.getByRole('separator', { name: 'Resize navigation' });
    resizer.focus();
    await user.keyboard('{ArrowRight}');
    expect(resizer.getAttribute('aria-valuenow')).toBe('288');
  });

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
