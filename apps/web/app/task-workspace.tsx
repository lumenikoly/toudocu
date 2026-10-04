import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { PageViewV1, PortalSnapshotV1, TaskHierarchyNode } from '@toudocu/contracts';
import { EntityReference, Status } from './document.js';
import { translator, type Locale } from './i18n.js';
import { PortalLink } from './routing.js';
import { Icon } from './ui/index.js';
import { TaskItemActions } from './task-actions.js';

type TaskPage = Extract<PageViewV1, { kind: 'task-workspace' }>;
type WorkItem = TaskPage['workItems'][number];
type Mode = 'board' | 'list' | 'tree';
type Filters = {
  query: string;
  status: string;
  type: string;
  module: string;
  priority: string;
  parent: string;
};
type ItemProps = {
  item: WorkItem;
  items: Map<string, WorkItem>;
  snapshot: PortalSnapshotV1;
  locale: Locale;
};
const activeStates = [
  'in-progress',
  'ready',
  'ready-candidate',
  'waiting',
  'needs-attention',
  'draft',
  'blocked',
];
const priorities: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function itemMatches(item: WorkItem, filters: Filters, items: Map<string, WorkItem>): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  let inBranch = !filters.parent;
  const seen = new Set<string>();
  for (
    let parent = item.parentId;
    parent && !seen.has(parent);
    parent = items.get(parent)?.parentId ?? null
  ) {
    if (parent === filters.parent) inBranch = true;
    seen.add(parent);
  }
  return (
    inBranch &&
    (!query ||
      `${item.id} ${item.title} ${item.moduleId ?? ''} ${item.type ?? ''}`
        .toLocaleLowerCase()
        .includes(query)) &&
    (!filters.status ||
      (filters.status === 'archive'
        ? item.archived
        : item.workspace.workState === filters.status)) &&
    (!filters.type || item.type === filters.type) &&
    (!filters.module || item.moduleId === filters.module) &&
    (!filters.priority || item.priority === filters.priority)
  );
}

function ItemLink({
  id,
  snapshot,
  children,
  label,
}: {
  id: string;
  snapshot: PortalSnapshotV1;
  children?: ReactNode;
  label?: string;
}) {
  const route = snapshot.routes.find((candidate) => candidate.pageId === `task:${id}`);
  return route ? (
    <PortalLink to={route.href} {...(label ? { label } : {})}>
      {children ?? <code>{id}</code>}
    </PortalLink>
  ) : (
    (children ?? <code>{id}</code>)
  );
}

function TaskProgress({ item, locale }: Pick<ItemProps, 'item' | 'locale'>) {
  const { format } = translator(locale);
  const completed = item.criteria.filter((criterion) => criterion.completed).length;
  const descendants = item.workspace.descendants;
  return (
    <div className="task-workspace-progress">
      {item.criteria.length > 0 && (
        <span>
          <progress
            value={completed}
            max={item.criteria.length}
            aria-label={format('taskCriteriaCount', {
              done: completed,
              total: item.criteria.length,
            })}
          />{' '}
          {completed} / {item.criteria.length}
        </span>
      )}
      {descendants.total > 0 && (
        <span
          title={format('taskDescendants', {
            done: descendants.counts.done,
            total: descendants.total,
          })}
        >
          <Icon name="tree" />
          {descendants.counts.done} / {descendants.total}
        </span>
      )}
    </div>
  );
}

function TaskDetails({ item, items, snapshot, locale }: ItemProps) {
  const { text, status } = translator(locale);
  const refs = (ids: string[]) => (
    <ul>
      {ids.map((id) => {
        const target = items.get(id);
        return (
          <li key={id}>
            <ItemLink id={id} snapshot={snapshot} /> {target?.title} ·{' '}
            {status(target?.workspace.workState ?? 'unknown')}
          </li>
        );
      })}
    </ul>
  );
  return (
    <details className="task-workspace-details">
      <summary>{text('details')}</summary>
      <dl>
        {item.parentId && (
          <>
            <dt>{text('parent')}</dt>
            <dd>{refs([item.parentId])}</dd>
          </>
        )}
        {item.dependsOn.length > 0 && (
          <>
            <dt>{text('dependencies')}</dt>
            <dd>{refs(item.dependsOn)}</dd>
          </>
        )}
        {item.childIds.length > 0 && (
          <>
            <dt>{text('children')}</dt>
            <dd>{refs(item.childIds)}</dd>
          </>
        )}
        {item.useCaseId && (
          <>
            <dt>{text('useCaseFilter')}</dt>
            <dd>
              <EntityReference value={item.useCaseId} snapshot={snapshot} />
            </dd>
          </>
        )}
        {item.blocker && (
          <>
            <dt>{text('blocked')}</dt>
            <dd>{item.blocker}</dd>
          </>
        )}
      </dl>
      {item.criteria.length > 0 && (
        <ul className="criteria-list">
          {item.criteria.map((criterion) => (
            <li key={`${criterion.line}:${criterion.text}`}>
              <label>
                <input type="checkbox" checked={criterion.completed} disabled /> {criterion.text}
              </label>
            </li>
          ))}
        </ul>
      )}
      {item.workspace.issues.length > 0 && (
        <ul>
          {item.workspace.issues.map((issue, index) => (
            <li key={`${issue.code}:${index}`}>{issue.message}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

function TaskCard(props: ItemProps) {
  const { item, items, snapshot, locale } = props;
  const { text, format, status } = translator(locale);
  const state = item.workspace.workState;
  const blockedBy = item.dependsOn.filter((id) => items.get(id)?.workspace.status !== 'done');
  const reason =
    state === 'ready'
      ? text('taskReadyReason')
      : state === 'waiting'
        ? format('taskWaitingReason', { ids: blockedBy.join(', ') })
        : state === 'ready-candidate'
          ? text('taskContractComplete')
          : ['draft', 'needs-attention'].includes(state) && item.workspace.issues.length
            ? format('taskContractIncomplete', { count: item.workspace.issues.length })
            : state === 'blocked'
              ? item.blocker
              : '';
  const preview = item.result || item.behaviorChange || reason;
  const hasRoute = snapshot.routes.some((route) => route.pageId === `task:${item.id}`);
  return (
    <article className="task-workspace-row" data-status={state}>
      <span className="task-row-marker" aria-hidden="true" />
      <div className="task-row-main">
        <ItemLink id={item.id} snapshot={snapshot}>
          <span className="task-row-id">{item.id}</span>
          <strong className="task-row-title">{item.title}</strong>
        </ItemLink>
        <div className="task-row-context">
          {item.priority && (
            <span className="task-row-badge" data-priority={item.priority}>
              {status(item.priority)}
            </span>
          )}
          {item.severity && (
            <span className="task-row-badge" data-severity={item.severity}>
              {status(item.severity)}
            </span>
          )}
          {item.moduleId && (
            <span className="task-row-badge task-row-module">
              <EntityReference value={item.moduleId} snapshot={snapshot} />
            </span>
          )}
          {item.type && <span className="task-row-type">{status(item.type)}</span>}
        </div>
        {preview && <p className="task-row-preview">{preview}</p>}
      </div>
      <TaskProgress item={item} locale={locale} />
      <div className="task-row-end">
        <Status status={{ kind: state, label: state }} locale={locale} />
        {hasRoute && (
          <ItemLink
            id={item.id}
            snapshot={snapshot}
            label={`${text('openDocument')}: ${item.title}`}
          >
            <span className="task-row-open">
              <Icon name="arrowRight" />
            </span>
          </ItemLink>
        )}
        <TaskItemActions item={item} snapshot={snapshot} locale={locale} />
      </div>
      <TaskDetails {...props} />
    </article>
  );
}

function TaskList({
  list,
  items,
  snapshot,
  locale,
}: Omit<ItemProps, 'item'> & { list: WorkItem[] }) {
  return (
    <div className="task-workspace-table">
      {list.map((item) => (
        <TaskCard key={item.id} item={item} items={items} snapshot={snapshot} locale={locale} />
      ))}
    </div>
  );
}

function TreeNode({
  node,
  visible,
  collapsed,
  toggle,
  ...props
}: Omit<ItemProps, 'item'> & {
  node: TaskHierarchyNode;
  visible: Set<string>;
  collapsed: Set<string>;
  toggle: (id: string) => void;
}) {
  const item = props.items.get(node.id);
  if (!item || !visible.has(node.id)) return null;
  const children = node.children.filter((child) => visible.has(child.id));
  const expanded = !collapsed.has(node.id);
  return (
    <li>
      {children.length > 0 && (
        <button
          className="task-tree-toggle"
          type="button"
          aria-expanded={expanded}
          aria-label={translator(props.locale).format(expanded ? 'taskCollapse' : 'taskExpand', {
            id: node.id,
          })}
          onClick={() => toggle(node.id)}
        >
          {expanded ? '−' : '+'}
        </button>
      )}
      <TaskCard item={item} {...props} />
      {children.length > 0 && expanded && (
        <ul>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              visible={visible}
              collapsed={collapsed}
              toggle={toggle}
              {...props}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TaskWorkspace({
  page,
  snapshot,
  locale,
}: {
  page: TaskPage;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { text, status } = translator(locale);
  const params = new URLSearchParams(location.search);
  const mode: Mode =
    params.get('mode') === 'list' ? 'list' : params.get('mode') === 'tree' ? 'tree' : 'board';
  const filters: Filters = {
    query: params.get('q') ?? '',
    status: params.get('status') ?? '',
    type: params.get('type') ?? '',
    module: params.get('module') ?? '',
    priority: params.get('priority') ?? '',
    parent: params.get('parent') ?? '',
  };
  const showCompleted = params.get('completed') === '1';
  const showArchive = params.get('archive') === '1';
  const [filtersOpen, setFiltersOpen] = useState(() =>
    Boolean(
      filters.type ||
      filters.module ||
      filters.priority ||
      filters.parent ||
      showCompleted ||
      showArchive ||
      (filters.status && !['in-progress', 'ready', 'waiting', 'blocked'].includes(filters.status)),
    ),
  );
  const items = useMemo(
    () => new Map(page.workItems.map((item) => [item.id, item])),
    [page.workItems],
  );
  const ordered = useMemo(
    () =>
      [...page.workItems].sort((left, right) => {
        const priority = (value: string | undefined) => priorities[value ?? ''] ?? 4;
        return (
          priority(left.priority) - priority(right.priority) ||
          left.id.localeCompare(right.id, undefined, { numeric: true })
        );
      }),
    [page.workItems],
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const storageKey = `toudocu:task-tree:${snapshot.project.title}`;
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      setCollapsed(
        new Set(
          Array.isArray(stored)
            ? stored.filter((value): value is string => typeof value === 'string')
            : [],
        ),
      );
    } catch {
      setCollapsed(new Set());
    }
  }, [storageKey]);
  const toggle = (id: string) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      /* Storage may be unavailable. */
    }
  };
  const update = (key: string, value: string | boolean) => {
    const next = new URLSearchParams(location.search);
    if (!value || value === 'board') next.delete(key);
    else next.set(key, value === true ? '1' : value);
    void navigate(`${location.pathname}${next.size ? `?${next}` : ''}`, { replace: true });
  };
  const matched = ordered.filter((item) => itemMatches(item, filters, items));
  const active = matched.filter(
    (item) => !item.archived && activeStates.includes(item.workspace.workState),
  );
  const done = matched.filter((item) => !item.archived && item.workspace.workState === 'done');
  const cancelled = matched.filter(
    (item) => !item.archived && item.workspace.workState === 'cancelled',
  );
  const archived = matched.filter((item) => item.archived);
  const archiveYears = [...new Set(archived.map((item) => item.archiveYear ?? '—'))]
    .sort()
    .reverse();
  const includeCompleted = showCompleted || ['done', 'cancelled'].includes(filters.status);
  const includeArchive = showArchive || filters.status === 'archive';
  const visibleItems = [
    ...active,
    ...(includeCompleted ? [...done, ...cancelled] : []),
    ...(includeArchive ? archived : []),
  ];
  const visible = new Set(visibleItems.map((item) => item.id));
  for (const item of visibleItems) {
    const seen = new Set<string>();
    for (
      let parent = item.parentId;
      parent && !seen.has(parent);
      parent = items.get(parent)?.parentId ?? null
    ) {
      visible.add(parent);
      seen.add(parent);
    }
  }
  const options = {
    status: [...activeStates, 'done', 'cancelled', 'archive'],
    type: [...new Set(ordered.flatMap((item) => (item.type ? [item.type] : [])))],
    module: [...new Set(ordered.flatMap((item) => (item.moduleId ? [item.moduleId] : [])))].sort(),
    priority: [...new Set(ordered.flatMap((item) => (item.priority ? [item.priority] : [])))],
    parent: ordered.filter((item) => item.childIds.length).map((item) => item.id),
  };
  const common = { items, snapshot, locale };
  const quickStates = ['', 'in-progress', 'ready', 'waiting', 'blocked'] as const;
  const advancedFilterCount = [
    filters.status && !quickStates.some((value) => value === filters.status),
    filters.type,
    filters.module,
    filters.priority,
    filters.parent,
    showCompleted,
    showArchive,
  ].filter(Boolean).length;
  const hasFilters = Boolean(
    filters.query || filters.status || advancedFilterCount || showCompleted || showArchive,
  );
  return (
    <section className="task-workspace" aria-labelledby="task-workspace-title">
      <header className="workspace-heading">
        <h1 id="task-workspace-title">{text('tasks')}</h1>
        <span className="workspace-count">
          {visibleItems.length} / {page.workItems.length}
        </span>
      </header>
      <nav className="task-workspace-quick" aria-label={text('status')}>
        {quickStates.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.status === value}
            onClick={() => update('status', value)}
          >
            {value ? status(value) : text('allActive')}{' '}
            <strong>
              {
                ordered.filter(
                  (item) =>
                    !item.archived &&
                    (value
                      ? item.workspace.workState === value
                      : activeStates.includes(item.workspace.workState)),
                ).length
              }
            </strong>
          </button>
        ))}
      </nav>
      <div className="task-workspace-toolbar">
        <input
          type="search"
          value={filters.query}
          onChange={(event) => update('q', event.currentTarget.value)}
          placeholder={text('searchTasks')}
          aria-label={text('searchTasksLabel')}
        />
        <details
          className="task-workspace-filters"
          open={filtersOpen}
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
        >
          <summary>
            <Icon name="settings" />
            {text('taskFilters')}
            {advancedFilterCount > 0 && <strong>{advancedFilterCount}</strong>}
          </summary>
          <div className="task-workspace-filter-fields">
            {(['status', 'type', 'module', 'priority', 'parent'] as const).map((key) => (
              <select
                key={key}
                value={filters[key]}
                onChange={(event) => update(key, event.currentTarget.value)}
                aria-label={text(key)}
              >
                <option value="">{text(key)}</option>
                {options[key].map((value) => (
                  <option key={value} value={value}>
                    {key === 'parent'
                      ? `${value} · ${items.get(value)?.title ?? ''}`
                      : status(value)}
                  </option>
                ))}
              </select>
            ))}
            <label>
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(event) => update('completed', event.currentTarget.checked)}
              />{' '}
              {text('completed')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showArchive}
                onChange={(event) => update('archive', event.currentTarget.checked)}
              />{' '}
              {text('archive')}
            </label>
          </div>
        </details>
        {hasFilters && (
          <button
            className="task-workspace-reset"
            type="button"
            onClick={() => {
              setFiltersOpen(false);
              void navigate(location.pathname, { replace: true });
            }}
          >
            {text('reset')}
          </button>
        )}
        <nav className="task-workspace-modes" aria-label={text('taskView')}>
          {(['board', 'list', 'tree'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              aria-label={text(value)}
              title={text(value)}
              onClick={() => update('mode', value)}
            >
              <Icon name={value} />
            </button>
          ))}
        </nav>
      </div>
      {visibleItems.length === 0 ? (
        <p className="empty-note">{text('noMatchingWork')}</p>
      ) : mode === 'tree' ? (
        <ul className="task-workspace-tree">
          {page.hierarchy.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              visible={visible}
              collapsed={collapsed}
              toggle={toggle}
              {...common}
            />
          ))}
        </ul>
      ) : (
        <>
          {mode === 'list' ? (
            active.length > 0 && <TaskList list={active} {...common} />
          ) : (
            <div className="task-workspace-board">
              {activeStates
                .filter((state) => active.some((item) => item.workspace.workState === state))
                .map((state) => (
                  <section key={state}>
                    <h2>
                      <span className="task-column-mark" data-status={state} />
                      {status(state)}{' '}
                      <span>
                        {active.filter((item) => item.workspace.workState === state).length}
                      </span>
                    </h2>
                    <ul>
                      {active
                        .filter((item) => item.workspace.workState === state)
                        .map((item) => (
                          <li key={item.id}>
                            <TaskCard item={item} {...common} />
                          </li>
                        ))}
                    </ul>
                  </section>
                ))}
            </div>
          )}
          {includeCompleted &&
            [done, cancelled].map(
              (list) =>
                list.length > 0 && (
                  <details
                    key={list[0]!.workspace.workState}
                    className="task-workspace-terminal-section"
                    open={Boolean(filters.status)}
                  >
                    <summary>
                      {status(list[0]!.workspace.workState)} ({list.length})
                    </summary>
                    <TaskList list={list} {...common} />
                  </details>
                ),
            )}
          {includeArchive && archived.length > 0 && (
            <details
              className="task-workspace-terminal-section"
              open={filters.status === 'archive'}
            >
              <summary>
                {text('archive')} ({archived.length})
              </summary>
              {archiveYears.map((year) => (
                <section key={year}>
                  <h3>{year}</h3>
                  <TaskList
                    list={archived.filter((item) => (item.archiveYear ?? '—') === year)}
                    {...common}
                  />
                </section>
              ))}
            </details>
          )}
        </>
      )}
    </section>
  );
}
