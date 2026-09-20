import { describe, expect, it } from 'vitest';
import { compileProject, type DocumentSource } from '@toudocu/core';
import { PortalSnapshotV1Schema } from '@toudocu/contracts';
import { buildPortalRouteRegistry } from './routes.js';
import { buildPortalSnapshot } from './mapper.js';

function source(sourcePath: string, content: string): DocumentSource {
  return { sourcePath, content, modifiedAt: new Date('2026-09-19T00:00:00Z') };
}

function project() {
  return compileProject(
    [
      source('index.md', '# Example\n\nProject description.\n'),
      source('status.md', '# Status\n\n- Status: in-progress\n\n## Summary\n\nWorking.\n'),
      source('roadmap.md', '# Roadmap\n\n## Next\n- [ ] DLV-001: Deliver\n'),
      source('health.md', '# Health\n\nA document that occupies health.html.\n'),
      source('modules/auth.md', '# MOD-AUTH: Auth\n\n- Status: active\n'),
      source('guides/deep/topic.md', '# Deep guide\n\nNested content.\n'),
      source(
        'use-cases/login.md',
        '# UC-LOGIN-001: Login\n\n- Status: ready\n- Module: MOD-AUTH\n',
      ),
      source(
        'flows/login.md',
        '# FLOW-LOGIN-001: Login flow\n\n- Module: MOD-AUTH\n- Use case: UC-LOGIN-001\n\n```mermaid\nflowchart TD\n  A --> B\n```\n',
      ),
      source(
        'screens/SC-LOGIN-001.md',
        '# SC-LOGIN-001: Login\n\n- Module: MOD-AUTH\n- Status: planned\n',
      ),
      source(
        'work/TASK-LOGIN-001.md',
        '<!-- toudocu\nid: TASK-LOGIN-001\nstatus: draft\ntaskType: maintenance\n-->\n' +
          '# TASK-LOGIN-001: Build login\n\n' +
          '<!-- toudocu:section result -->\n## Result\n\nLogin is available.\n',
      ),
      source(
        'work/TASK-LOGIN-002.md',
        '<!-- toudocu\nid: TASK-LOGIN-002\nstatus: draft\ntaskType: maintenance\nparentTask: TASK-LOGIN-001\n-->\n' +
          '# TASK-LOGIN-002: Add login form\n\n' +
          '<!-- toudocu:section result -->\n## Result\n\nThe form is available.\n',
      ),
    ],
    {
      now: new Date('2026-09-19T00:00:00Z'),
      staleDays: 90,
      links: { repositoryRoot: '/', documentRoot: '/' },
      repository: { exists: () => false, matches: () => [] },
      projectChangelog: source('CHANGELOG.md', '# Changelog\n\n- First release.\n'),
      projectChangelogTitle: 'Project changelog',
    },
  );
}

describe('portal routes and snapshot', () => {
  it('keeps the public processes and search routes for an empty project', () => {
    const compiled = compileProject([source('index.md', '# Empty project\n')], {
      now: new Date('2026-09-19T00:00:00Z'),
      staleDays: 90,
      links: { repositoryRoot: '/', documentRoot: '/' },
      repository: { exists: () => false, matches: () => [] },
    });
    const registry = buildPortalRouteRegistry(compiled, { environment: 'static' });

    expect(registry.get('processes')?.outputPath).toBe('processes/index.html');
    expect(registry.get('search')?.outputPath).toBe('search.html');
  });

  it('keeps generated routes separate from the source home document', () => {
    const compiled = project();
    const registry = buildPortalRouteRegistry(compiled, {
      environment: 'static',
      screenMapEnabled: true,
    });
    const serveRegistry = buildPortalRouteRegistry(compiled, { environment: 'serve' });

    expect(registry.get('home')?.outputPath).toBe('index.html');
    expect(registry.get('document:index.md')).toBeUndefined();
    expect(registry.get('processes')?.outputPath).toBe('processes/index.html');
    expect(registry.get('screens')?.outputPath).toBe('screens/catalog.html');
    expect(registry.get('screen-map')?.outputPath).toBe('screens/index.html');
    expect(registry.get('changelog')?.outputPath).toBe('project-changelog.html');
    expect(registry.get('health')?.outputPath).toBe('documentation-health.html');
    expect(registry.get('task:TASK-LOGIN-001')?.kind).toBe('task');
    expect(registry.get('document:work/TASK-LOGIN-001.md')).toBeUndefined();
    expect(registry.get('directory:guides/deep')?.outputPath).toBe('guides/deep/index.html');
    expect(registry.href('directory:guides/deep')).toBe('guides/deep/index.html');
    expect(registry.get('editor')).toBeUndefined();
    expect(serveRegistry.get('editor')?.serveOnly).toBe(true);
    expect(serveRegistry.get('changes')?.availability).toBe('serve');
    expect(new Set(registry.routes.map((item) => item.outputPath.toLowerCase())).size).toBe(
      registry.routes.length,
    );
  });

  it('maps static and serve pages through the same semantic DTO', () => {
    const compiled = project();
    const staticSnapshot = buildPortalSnapshot(compiled, {
      version: 'test',
      environment: 'static',
    });
    const serveSnapshot = buildPortalSnapshot(compiled, { version: 'test', environment: 'serve' });

    expect(() => PortalSnapshotV1Schema.parse(staticSnapshot)).not.toThrow();
    expect(() => PortalSnapshotV1Schema.parse(serveSnapshot)).not.toThrow();
    const sharedRoutes = serveSnapshot.routes.filter((route) => route.availability !== 'serve');
    const sharedPageIds = new Set(sharedRoutes.map((route) => route.pageId));
    expect(staticSnapshot.routes).toEqual(sharedRoutes);
    expect(staticSnapshot.pages).toEqual(
      serveSnapshot.pages.filter((page) => sharedPageIds.has(page.pageId)),
    );
    expect(staticSnapshot.capabilities.editing).toBe(false);
    expect(serveSnapshot.capabilities.editing).toBe(true);
    expect(staticSnapshot.routes.some((route) => route.availability === 'serve')).toBe(false);
    expect(serveSnapshot.pages.some((page) => page.kind === 'editor')).toBe(true);
    expect(serveSnapshot.navigation.items.map((item) => item.pageId)).toEqual(
      expect.arrayContaining(['editor', 'changes', 'discussions', 'api-docs']),
    );
    expect(staticSnapshot.navigation.items.map((item) => item.pageId)).not.toContain('editor');
    expect(staticSnapshot.pages.some((page) => page.kind === 'changelog')).toBe(true);
    expect(
      staticSnapshot.pages.some(
        (page) => page.kind === 'task' && page.workItem.id === 'TASK-LOGIN-001',
      ),
    ).toBe(true);
    const parentTask = staticSnapshot.pages.find(
      (page) => page.kind === 'task' && page.workItem.id === 'TASK-LOGIN-001',
    );
    const childTask = staticSnapshot.pages.find(
      (page) => page.kind === 'task' && page.workItem.id === 'TASK-LOGIN-002',
    );
    expect(parentTask?.kind === 'task' && parentTask.hierarchy[0]?.children[0]?.id).toBe(
      'TASK-LOGIN-002',
    );
    expect(childTask?.kind === 'task' && childTask.hierarchy.map((item) => item.id)).toEqual([
      'TASK-LOGIN-002',
    ]);
    expect(
      staticSnapshot.pages.some(
        (page) => page.kind === 'home' && page.document?.sourcePath === 'index.md',
      ),
    ).toBe(true);
    expect(
      staticSnapshot.pages.some(
        (page) =>
          page.kind === 'home' && page.document?.html.includes('<p>Project description.</p>'),
      ),
    ).toBe(true);
    expect(
      staticSnapshot.pages.some(
        (page) => page.kind === 'document' && page.document.sourcePath === 'index.md',
      ),
    ).toBe(false);
    expect(JSON.stringify(staticSnapshot)).not.toContain('"byPath"');
  });
});
