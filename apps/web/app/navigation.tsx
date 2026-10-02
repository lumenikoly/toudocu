import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { NavigationItem, PortalRoute } from '@toudocu/contracts';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { PortalLink } from './routing.js';

export function Navigation({
  items,
  routes,
  locale,
}: {
  items: NavigationItem[];
  routes: PortalRoute[];
  locale: Locale;
}) {
  const { text } = translator(locale);
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem('toudocu-navigation-groups') ?? '[]'));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    const folder = location.pathname.split('/').filter(Boolean)[0];
    if (folder) setOpenGroups((current) => new Set(current).add(folder));
  }, [location.pathname]);
  const toggleGroup = (folder: string, open: boolean): void => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(folder);
      else next.delete(folder);
      localStorage.setItem('toudocu-navigation-groups', JSON.stringify([...next]));
      return next;
    });
  };
  const generatedTitle = (item: NavigationItem): string => {
    const keys: Partial<Record<string, MessageKey>> = {
      home: 'home',
      'use-cases': 'useCases',
      processes: 'processes',
      screens: 'screens',
      'screen-map': 'screenMap',
      traceability: 'traceability',
      roadmap: 'roadmap',
      changelog: 'changelog',
      health: 'health',
      'task-workspace': 'taskWorkspace',
      editor: 'editor',
      changes: 'changes',
      'api-docs': 'apiDocs',
    };
    const key = keys[item.pageId];
    return key ? text(key) : item.title;
  };
  const glyph = (item: NavigationItem): string => {
    if (item.kind === 'task' || item.pageId === 'task-workspace') return 'TK';
    if (item.pageId === 'health') return 'HL';
    if (item.pageId === 'changes') return 'CH';
    if (item.pageId === 'editor') return 'ED';
    if (item.pageId === 'home') return 'PR';
    return item.kind.slice(0, 2).toUpperCase();
  };
  const render = (entries: NavigationItem[]): ReactNode => (
    <ul>
      {entries.map((item) => (
        <li key={item.id}>
          <PortalLink to={item.href}>
            {item.status?.kind ? (
              <span
                className="nav-status"
                data-status={item.status.kind}
                role="img"
                aria-label={translator(locale).status(item.status.kind)}
                title={translator(locale).status(item.status.kind)}
              >
                {item.status.kind === 'done' && (
                  <svg viewBox="0 0 12 12" aria-hidden="true">
                    <path d="m2.5 6 2.2 2.2 4.8-4.8" />
                  </svg>
                )}
              </span>
            ) : (
              <span className="nav-item-glyph" aria-hidden="true">
                {glyph(item)}
              </span>
            )}
            <span className="nav-item-label">{generatedTitle(item)}</span>
          </PortalLink>
          {item.children.length > 0 && render(item.children)}
        </li>
      ))}
    </ul>
  );
  const groups = new Map<string, NavigationItem[]>();
  const tools: NavigationItem[] = [];
  for (const item of items) {
    if (item.pageId === 'discussions') continue;
    if (item.pageId === 'screen-map' || item.pageId === 'screens') {
      groups.set('screens', [item, ...(groups.get('screens') ?? [])]);
      continue;
    }
    if (!item.id.includes('/') && item.kind !== 'task') {
      tools.push(item);
      continue;
    }
    const folder = item.kind === 'task' ? 'work' : (item.id.split('/')[0] ?? '');
    groups.set(folder, [...(groups.get(folder) ?? []), item]);
  }
  const primaryIds = new Set(['home', 'changes', 'health', 'editor']);
  const primary = tools.filter(
    (item) => primaryIds.has(item.pageId) && !['editor', 'changes'].includes(item.pageId),
  );
  const groupPageIds = new Set([
    'task-workspace',
    'use-cases',
    'processes',
    'screens',
    'screen-map',
  ]);
  const project = tools.filter(
    (item) => !primaryIds.has(item.pageId) && !groupPageIds.has(item.pageId),
  );
  const groupRoute = (folder: string): PortalRoute | undefined => {
    const pageId: Record<string, string> = {
      work: 'task-workspace',
      'use-cases': 'use-cases',
      flows: 'processes',
      screens: 'screen-map',
    };
    return routes.find(
      (route) =>
        route.pageId === (pageId[folder] ?? folder) || route.pageId === `directory:${folder}`,
    );
  };
  return (
    <nav aria-label={text('navigation')}>
      {render(primary)}
      <div className="nav-section-label">{text('knowledge')}</div>
      {[...groups].map(([folder, entries]) => {
        const overview = entries.find(
          (item) => item.id === `${folder}/index.md` || item.id === `${folder}/overview.md`,
        );
        const route = overview ?? groupRoute(folder);
        const children = entries.filter(
          (item) => item !== overview && item.pageId !== route?.pageId,
        );
        const title = overview?.title ?? translator(locale).sectionTitle(folder);
        return (
          <details
            className="nav-group"
            key={folder}
            open={openGroups.has(folder)}
            onToggle={(event) => toggleGroup(folder, event.currentTarget.open)}
          >
            <summary
              onClick={(event) => {
                if ((event.target as HTMLElement).closest('a')) event.preventDefault();
              }}
            >
              {route ? (
                <PortalLink className="nav-group-title" to={route.href}>
                  {title}
                </PortalLink>
              ) : (
                <span className="nav-group-title">{title}</span>
              )}
              <span>{children.length}</span>
            </summary>
            {render(children)}
          </details>
        );
      })}
      {project.length > 0 && (
        <details className="nav-group project-navigation" open>
          <summary>
            <span className="nav-group-title">{text('project')}</span>
          </summary>
          {render(project)}
        </details>
      )}
    </nav>
  );
}
