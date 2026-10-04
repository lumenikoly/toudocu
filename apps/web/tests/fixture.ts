import { compileProject, type DocumentSource } from '@toudocu/core';
import { buildPortalSnapshot } from '@toudocu/portal';

const modifiedAt = new Date('2026-09-19T00:00:00Z');

function source(sourcePath: string, content: string): DocumentSource {
  return { sourcePath, content, modifiedAt };
}

export function portalFixture(environment: 'static' | 'serve' = 'static') {
  const project = compileProject(
    [
      source(
        'index.md',
        '# Example project\n\nProject content stays in English. [Deep guide](guides/deep.md)\n',
      ),
      source(
        'guides/deep.md',
        '# Deep guide\n\nUseful searchable material.\n\n```mermaid\nflowchart TD\n  A --> B\n```\n',
      ),
      source(
        'work/TASK-WEB-001.md',
        '<!-- toudocu\nid: TASK-WEB-001\nstatus: draft\ntaskType: maintenance\n-->\n' +
          '# TASK-WEB-001: Build web app\n\n' +
          '<!-- toudocu:section result -->\n## Result\n\nThe portal works.\n',
      ),
      source(
        'roadmap.md',
        '# Roadmap\n\n<!-- toudocu:section roadmap-stage -->\n<!-- toudocu\nstatus: planned\n-->\n\n## Next\n\n- [ ] `DLV-WEB-001` Publish the portal.\n',
      ),
    ],
    {
      now: modifiedAt,
      staleDays: 90,
      links: { repositoryRoot: '/repo', documentRoot: '/repo/docs' },
      repository: { exists: () => false, matches: () => [] },
    },
  );
  return buildPortalSnapshot(project, { version: 'test', environment });
}
