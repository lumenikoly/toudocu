// @vitest-environment jsdom
import { cleanup, render, screen, within, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { DocumentContent, DocumentLink, EntityReference } from '../app/document.js';
import { EditorWorkspace } from '../app/editor-workspace.js';
import { PortalLink } from '../app/routing.js';
import { TaskItemActions } from '../app/task-actions.js';
import { PortalApp } from '../app/root.js';
import { insertRoadmapItem } from '../app/pages.js';
import { TaskWorkspace } from '../app/task-workspace.js';
import { portalFixture } from './fixture.js';
import { ApiDocsWorkspace } from '../app/workspaces.js';
import { SwaggerUIBundle } from 'swagger-ui-dist';

vi.mock('swagger-ui-dist', () => ({
  SwaggerUIBundle: Object.assign(vi.fn(), { presets: { apis: {} } }),
}));

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), run: vi.fn(async () => undefined) },
}));

vi.mock('../app/code-editor.js', () => ({
  CodeEditor: ({
    file,
    content,
    onChange,
  }: {
    file: { path: string };
    content: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label={file.path}
      value={content}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('portal application', () => {
  it('opens the requested editor file instead of the remembered file and follows subsequent query navigation', async () => {
    const user = userEvent.setup();
    const files = ['index.md', 'guides/deep.md', 'work/TASK-WEB-001.md'].map((path) => ({
      path,
      language: 'markdown',
      size: 20,
      digest: path,
    }));
    sessionStorage.setItem('toudocu-editor-path', 'index.md');
    const fetch = vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      if (url.pathname.endsWith('/files'))
        return Response.json({ schemaVersion: 1, revision: 'test', files, templates: [] });
      if (url.pathname.endsWith('/validate'))
        return Response.json({ schemaVersion: 1, path: 'guides/deep.md', diagnostics: [] });
      const file = files.find((entry) => entry.path === url.searchParams.get('path'));
      if (!file) throw new Error(`Unexpected editor request: ${input}`);
      return Response.json({
        schemaVersion: 1,
        revision: 'test',
        file: { ...file, content: `# ${file.path}`, diagnostics: [] },
      });
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <MemoryRouter initialEntries={['/_toudocu/editor/?path=guides%2Fdeep.md']}>
        <PortalLink to="_toudocu/editor/?path=work%2FTASK-WEB-001.md">Edit task</PortalLink>
        <EditorWorkspace locale="en" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('textbox', { name: 'guides/deep.md' })).toBeTruthy();
    expect(
      fetch.mock.calls.filter(([path]) => path.includes('/file?')).map(([path]) => path),
    ).toEqual(['/_toudocu/api/editor/file?path=guides%2Fdeep.md']);
    await user.click(screen.getByRole('link', { name: 'Edit task' }));
    expect(await screen.findByRole('textbox', { name: 'work/TASK-WEB-001.md' })).toBeTruthy();
    expect(sessionStorage.getItem('toudocu-editor-path')).toBe('work/TASK-WEB-001.md');
  });

  it('copies the task skill prompt without an agent and sends the same prompt when the console is available', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const snapshot = portalFixture();
    const page = snapshot.pages.find((entry) => entry.kind === 'task');
    if (!page || page.kind !== 'task') throw new Error('Missing task fixture');
    const view = render(
      <TaskItemActions item={page.workItem} snapshot={snapshot} locale="en" inline />,
    );
    await user.click(screen.getByRole('button', { name: 'Copy prompt: Clarify task' }));
    expect(write).toHaveBeenCalledWith('$toudocu clarify TASK-WEB-001');
    expect(screen.getByRole('status').textContent).toBe('Copied');
    view.rerender(
      <TaskItemActions
        item={page.workItem}
        snapshot={{ ...snapshot, capabilities: { ...snapshot.capabilities, agentConsole: true } }}
        locale="en"
        inline
      />,
    );
    const compose = vi.fn();
    document.addEventListener('toudocu:agent-compose', compose);
    try {
      await user.click(screen.getByRole('button', { name: 'Clarify task' }));
      expect(compose).toHaveBeenCalledOnce();
      expect((compose.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        text: '$toudocu clarify TASK-WEB-001',
        policy: 'normal',
      });
    } finally {
      document.removeEventListener('toudocu:agent-compose', compose);
    }
  });

  it('discloses the document warning with its message, code and linked source', async () => {
    const user = userEvent.setup();
    const snapshot = portalFixture('serve');
    const page = snapshot.pages.find((entry) => entry.kind === 'task');
    if (!page || page.kind !== 'task') throw new Error('Missing task fixture');
    page.document.errors = 0;
    page.document.warnings = 1;
    page.document.metadata = {
      ...page.document.metadata,
      priority: 'high',
      taskType: 'feature',
      severity: 'major',
    };
    snapshot.issues = [
      {
        severity: 'warning',
        code: 'DOC-WARNING',
        message: 'The task needs an owner.',
        documentPath: page.document.sourcePath,
        line: 7,
        column: 1,
      },
    ];
    const view = render(
      <MemoryRouter>
        <DocumentContent document={page.document} snapshot={snapshot} locale="ru" />
      </MemoryRouter>,
    );
    const disclosure = view.container.querySelector<HTMLDetailsElement>('.document-diagnostics')!;
    expect(disclosure.open).toBe(false);
    await user.click(screen.getByText('1 предупреждение'));
    expect(disclosure.open).toBe(true);
    expect(within(disclosure).getByText('DOC-WARNING')).toBeTruthy();
    expect(within(disclosure).getByText('The task needs an owner.')).toBeTruthy();
    expect(
      within(disclosure)
        .getByRole('link', { name: 'work/TASK-WEB-001.md:7:1' })
        .getAttribute('href'),
    ).toBe('_toudocu/editor?path=work%2FTASK-WEB-001.md');
    expect(screen.getByRole('link', { name: 'Редактировать' }).textContent).toBe('');
    const properties = view.container.querySelector('.document-metadata')!;
    expect(within(properties as HTMLElement).getByText('Приоритет')).toBeTruthy();
    expect(within(properties as HTMLElement).getByText('Высокий')).toBeTruthy();
    expect(within(properties as HTMLElement).getByText('Функциональность')).toBeTruthy();
    expect(within(properties as HTMLElement).getByText('Серьёзность')).toBeTruthy();
    expect(within(properties as HTMLElement).queryByText('priority')).toBeNull();
    expect(within(properties as HTMLElement).queryByText('high')).toBeNull();
  });

  it('localizes root section titles and keeps linked and unavailable catalog rows in the same layout', () => {
    const snapshot = portalFixture();
    const guide = snapshot.pages.find((entry) => entry.kind === 'document');
    if (!guide || guide.kind !== 'document') throw new Error('Missing document fixture');
    const route = {
      ...guide.route,
      pageId: 'directory:modules',
      href: 'modules/index.html',
      outputPath: 'modules/index.html',
    };
    snapshot.routes.push(route);
    snapshot.pages.push({
      kind: 'catalog',
      pageId: route.pageId,
      route,
      data: {
        section: 'modules',
        title: 'modules',
        entities: [],
        documents: [
          guide.document,
          {
            ...guide.document,
            sourcePath: 'modules/unavailable.md',
            title: 'Unavailable document',
          },
        ],
      },
    });
    const view = render(
      <PortalApp snapshot={snapshot} initialPath="/modules/index.html" locale="ru" />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Модули' })).toBeTruthy();
    const rows = view.container.querySelectorAll('.catalog-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.tagName).toBe('A');
    expect(rows[1]?.tagName).toBe('SPAN');
    expect(screen.queryByRole('link', { name: 'Unavailable document' })).toBeNull();
  });

  it('links known entity IDs, source paths and the home document without inventing missing targets', () => {
    const snapshot = portalFixture();
    render(
      <MemoryRouter>
        <EntityReference value="TASK-WEB-001" snapshot={snapshot} />
        <EntityReference value="guides/deep.md" snapshot={snapshot} />
        <EntityReference value="TASK-MISSING" snapshot={snapshot} />
        <DocumentLink sourcePath="index.md" snapshot={snapshot} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'TASK-WEB-001' }).getAttribute('href')).toBe(
      'work/TASK-WEB-001.html',
    );
    expect(screen.getByRole('link', { name: 'guides/deep.md' }).getAttribute('href')).toBe(
      'guides/deep.html',
    );
    expect(screen.getByRole('link', { name: 'Example project' }).getAttribute('href')).toBe(
      'index.html',
    );
    expect(screen.queryByRole('link', { name: 'TASK-MISSING' })).toBeNull();
  });

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

  it('keeps the overview collapsed until requested and highlights the opened document', async () => {
    const user = userEvent.setup();
    const view = render(<PortalApp snapshot={portalFixture()} initialPath="/" />);
    const about = view.container.querySelector<HTMLDetailsElement>('.project-about')!;
    expect(about.open).toBe(false);
    await user.click(screen.getByText('About the project'));
    expect(about.open).toBe(true);
    await user.click(within(about).getByRole('link', { name: 'Deep guide' }));
    expect(
      within(screen.getByRole('navigation', { name: 'Documentation navigation' }))
        .getByRole('link', { name: 'Deep guide' })
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
    const width = Number(resizer.getAttribute('aria-valuenow'));
    resizer.focus();
    await user.keyboard('{ArrowRight}');
    expect(Number(resizer.getAttribute('aria-valuenow'))).toBe(width + 16);
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
    await user.type(within(screen.getByRole('main')).getByRole('searchbox'), 'Deep');
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

  it('preserves source and explains a Mermaid failure without failing other diagrams', async () => {
    const snapshot = portalFixture();
    const page = snapshot.pages.find((entry) => entry.kind === 'document');
    if (!page || page.kind !== 'document') throw new Error('Missing document fixture');
    const invalid = 'flowchart TD\nA --> Public[GET /i/{slug}]';
    const valid = 'flowchart TD\nA --> B';
    page.document.html = `<pre data-mermaid><code>${invalid}</code></pre><pre data-mermaid><code>${valid}</code></pre>`;
    const run = vi.fn(async ({ nodes }: { nodes: Element[] }) => {
      const node = nodes[0]!;
      if (node.textContent === invalid) {
        node.innerHTML = '<svg>Syntax error</svg>';
        throw { message: "Parse error: got 'DIAMOND_START' at /i/{slug}" };
      }
      node.innerHTML = '<svg aria-label="Valid flowchart"></svg>';
    });
    (window as Window & { mermaid?: { run: typeof run } }).mermaid = { run };
    try {
      const view = render(
        <PortalApp snapshot={snapshot} initialPath="/guides/deep.html" locale="ru" />,
      );
      await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(view.container.querySelectorAll('.mermaid-frame')).toHaveLength(2),
      );
      expect(view.container.querySelector('[data-mermaid-error] > code')?.textContent).toBe(
        invalid,
      );
      expect(view.container.querySelectorAll('[data-mermaid-error]')).toHaveLength(1);
      expect(view.container.querySelector('[aria-label="Valid flowchart"]')).toBeTruthy();
      const details = screen
        .getByText('Причина ошибки', { selector: 'summary' })
        .closest('details')!;
      expect(details.open).toBe(false);
      await userEvent.setup().click(screen.getByText('Причина ошибки', { selector: 'summary' }));
      expect(details.open).toBe(true);
      expect(
        within(details).getByText("Parse error: got 'DIAMOND_START' at /i/{slug}"),
      ).toBeTruthy();
    } finally {
      delete (window as Window & { mermaid?: unknown }).mermaid;
    }
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

  it('keeps secondary task filters behind a disclosure while allowing a status filter to be applied and reset', async () => {
    const snapshot = portalFixture();
    const page = snapshot.pages.find((entry) => entry.kind === 'task-workspace');
    if (!page || page.kind !== 'task-workspace') throw new Error('Missing task workspace fixture');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TaskWorkspace page={page} snapshot={snapshot} locale="en" />
      </MemoryRouter>,
    );

    const filterSummary = screen.getByText('Filters', { selector: 'summary' });
    const disclosure = filterSummary.closest('details')!;
    expect(disclosure.open).toBe(false);
    expect(screen.getByRole('searchbox', { name: 'Search tasks' })).toBeTruthy();
    await user.click(filterSummary);
    expect(disclosure.open).toBe(true);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'done');
    expect(screen.getByText('No work items match these filters.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(disclosure.open).toBe(false);
    expect(screen.getByText('Build web app')).toBeTruthy();
  });

  it('keeps archived tasks out of active counts and shows each archived task once when filtered', async () => {
    const snapshot = portalFixture();
    const page = snapshot.pages.find((entry) => entry.kind === 'task-workspace');
    if (!page || page.kind !== 'task-workspace') throw new Error('Missing task workspace fixture');
    const task = page.workItems[0];
    if (!task) throw new Error('Missing task fixture');
    page.workItems.push({
      ...task,
      id: 'TASK-WEB-099',
      title: 'Archived task',
      archived: true,
      archiveYear: '2025',
    });
    const user = userEvent.setup();
    const view = render(
      <MemoryRouter>
        <TaskWorkspace page={page} snapshot={snapshot} locale="en" />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'All active 1' })).toBeTruthy();
    expect(screen.queryByText('Archived task')).toBeNull();
    await user.click(screen.getByText('Filters', { selector: 'summary' }));
    await user.click(screen.getByRole('checkbox', { name: 'Archive' }));
    expect(
      view.container.querySelectorAll('.task-workspace-terminal-section .task-workspace-row'),
    ).toHaveLength(1);
    expect(screen.getAllByText('Archived task')).toHaveLength(1);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'archive');
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(
      view.container.querySelectorAll('.task-workspace-terminal-section .task-workspace-row'),
    ).toHaveLength(1);
    expect(screen.getAllByText('Archived task')).toHaveLength(1);
  });
});
