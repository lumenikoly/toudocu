import { useEffect, useId, useRef, useState } from 'react';
import {
  definePluginApp,
  Markdown,
  useRpc,
  useBbNavigate,
  type PluginThreadPanelProps,
  type PluginNewThreadPanelProps,
} from '@get-bb/plugin-sdk/app';
import type { ChangeSetReportV1, TaskVerifyReportV1, ProjectWorkspaceV1 } from '@toudocu/contracts';
import type { rpcContract, PanelData, Scope, TaskEntry } from './contract.js';
import { reachableWorkspace } from './toudocu/workspace-link.js';
import './ui.css';

type View = {
  data: PanelData | null;
  selected: string | null;
  search: string;
  filter: string;
  collapsed: string[];
};
const views = new Map<string, View>();
const finished = (entry: TaskEntry) => ['done', 'cancelled'].includes(entry.task.status.kind);
function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d={back ? 'm15 18-6-6 6-6' : 'm9 6 6 6-6 6'} />
    </svg>
  );
}

function ToudocuPanel({ scope, scopeKey }: { scope: Scope | null; scopeKey: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const contentId = useId();
  const [view, setView] = useState<View>(
    () =>
      views.get(scopeKey) ?? {
        data: null,
        selected: null,
        search: '',
        filter: 'all',
        collapsed: [],
      },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');
  const [tab, setTab] = useState('task');
  const [checks, setChecks] = useState<TaskVerifyReportV1 | null>(null);
  const [changes, setChanges] = useState<ChangeSetReportV1 | null>(null);
  const [liveWorkspace, setLiveWorkspace] = useState<ProjectWorkspaceV1 | null>(null);
  const request = useRef(0);
  const current = useRef(view);
  current.current = view;
  function update(patch: Partial<View>) {
    const next = { ...current.current, ...patch };
    current.current = next;
    if (views.size >= 32 && !views.has(scopeKey)) views.delete(views.keys().next().value!);
    views.set(scopeKey, next);
    setView(next);
  }
  async function load(refresh = false) {
    if (!scope) return;
    const id = ++request.current;
    setLoading(true);
    setError('');
    try {
      const data = await rpc.call('panel', { ...scope, refresh });
      if (request.current !== id) return;
      const selected = current.current.selected ?? data.binding?.taskId ?? null;
      update({
        data,
        selected: data.tasks.some((entry) => entry.task.id === selected) ? selected : null,
      });
    } catch (cause) {
      if (request.current === id) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request.current === id) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [rpc, scopeKey]);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    let checking = false;
    async function discoverWorkspace() {
      if (checking) return;
      checking = true;
      try {
        const workspace = await rpc.call('workspace', scope!);
        if (active) setLiveWorkspace(workspace);
      } catch {
        if (active) setLiveWorkspace(null);
      } finally {
        checking = false;
      }
    }
    setLiveWorkspace(null);
    void discoverWorkspace();
    const timer = setInterval(() => {
      void discoverWorkspace();
    }, 30_000);
    const onFocus = () => {
      void discoverWorkspace();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [rpc, scopeKey]);
  const entries = view.data?.tasks ?? [];
  const byId = new Map(entries.map((entry) => [entry.task.id, entry]));
  const children = new Map<string | null, TaskEntry[]>();
  for (const entry of entries) {
    const parent =
      entry.task.parentId && byId.has(entry.task.parentId) ? entry.task.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), entry]);
  }
  for (const siblings of children.values())
    siblings.sort((a, b) => Number(finished(a)) - Number(finished(b)));
  const term = view.search.trim().toLocaleLowerCase();
  const matches = (entry: TaskEntry) =>
    (!term || `${entry.task.id} ${entry.task.title}`.toLocaleLowerCase().includes(term)) &&
    (view.filter === 'all' ||
      (view.filter === 'active' ? !finished(entry) : entry.ready?.readyForWork));
  function visible(entry: TaskEntry, path = new Set<string>()): boolean {
    if (path.has(entry.task.id)) return false;
    const next = new Set(path).add(entry.task.id);
    return Boolean(
      matches(entry) || children.get(entry.task.id)?.some((child) => visible(child, next)),
    );
  }
  const selected = view.selected ? byId.get(view.selected) : undefined;
  const ancestors: TaskEntry[] = [];
  const seen = new Set<string>();
  let parentId = selected?.task.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    parentId = parent.task.parentId;
  }
  function select(id: string | null) {
    update({ selected: id });
    setTab('task');
    setChecks(null);
    setChanges(null);
    setError('');
  }
  async function act(name: string, action: () => Promise<void>) {
    setPending(name);
    setError('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending('');
    }
  }
  function tree(parent: string | null, path = new Set<string>()) {
    return (
      <ul className="td-tree">
        {(children.get(parent) ?? [])
          .filter((entry) => !path.has(entry.task.id) && visible(entry))
          .map((entry) => {
            const id = entry.task.id;
            const count = children.get(id)?.length ?? 0;
            const expanded = Boolean(term || view.filter !== 'all' || !view.collapsed.includes(id));
            return (
              <li key={id}>
                <div className={`td-row${view.selected === id ? ' is-selected' : ''}`}>
                  {count ? (
                    <button
                      className="td-disclosure"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${id}`}
                      aria-expanded={expanded}
                      onClick={() =>
                        update({
                          collapsed: expanded
                            ? [...view.collapsed, id]
                            : view.collapsed.filter((item) => item !== id),
                        })
                      }
                    >
                      <span className={expanded ? 'is-expanded' : ''}>
                        <Chevron />
                      </span>
                    </button>
                  ) : (
                    <span className="td-disclosure" />
                  )}
                  <button
                    className="td-task"
                    onClick={() => select(id)}
                    aria-current={view.selected === id ? 'true' : undefined}
                  >
                    <span className="td-row-meta">
                      <span title={id}>{id}</span>
                      <span className="td-status" data-status={entry.task.status.kind}>
                        {entry.task.status.label}
                      </span>
                    </span>
                    <span className="td-title">{entry.task.title}</span>
                  </button>
                  {count > 0 && (
                    <span className="td-count" title={`${count} subtasks`}>
                      {count}
                    </span>
                  )}
                </div>
                {count > 0 && expanded && tree(id, new Set(path).add(id))}
              </li>
            );
          })}
      </ul>
    );
  }
  return (
    <div className="td-shell">
      <div className={`td-workspace${selected ? ' has-selection' : ''}`}>
        <aside className="td-browser" aria-label="Tasks">
          <header className="td-toolbar">
            <strong>Tasks</strong>
            <span className="td-count">{view.data ? entries.length : ''}</span>
            <button className="td-refresh" disabled={loading} onClick={() => void load(true)}>
              {loading && view.data ? 'Updating…' : 'Refresh'}
            </button>
          </header>
          <div className="td-filters">
            <input
              aria-label="Find task"
              placeholder="Search tasks…"
              value={view.search}
              onChange={(event) => update({ search: event.target.value })}
            />
            <div className="td-filter-tabs" aria-label="Task status">
              {[
                ['all', 'All'],
                ['active', 'Active'],
                ['ready', 'Ready'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={view.filter === value}
                  onClick={() => update({ filter: value! })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!scope && <p className="td-empty">Choose a project to see its tasks.</p>}
          {scope && !view.data && loading && (
            <div className="td-skeleton" role="status" aria-label="Loading tasks">
              <span />
              <span />
              <span />
            </div>
          )}
          {error && !selected && (
            <p role="alert" className="td-error">
              {error}
            </p>
          )}
          {view.data && (
            <nav className="td-tree-scroll" aria-label="Task hierarchy">
              {tree(null)}
              {!entries.some((entry) => visible(entry)) && (
                <p className="td-empty">
                  {entries.length ? 'No matching tasks.' : 'No tasks in this project.'}
                </p>
              )}
            </nav>
          )}
          {liveWorkspace && scope && (
            <button
              className="td-portal"
              disabled={Boolean(pending)}
              onClick={() =>
                void act('open', async () => {
                  const workspace = await rpc.call('workspace', scope);
                  setLiveWorkspace(workspace);
                  if (!workspace) throw new Error('This Toudocu workspace is no longer running.');
                  const url = (await reachableWorkspace(workspace))
                    ? workspace.url
                    : await rpc.call('shareWorkspace', {
                        ...scope,
                        instanceId: workspace.instanceId,
                      });
                  navigate.openUrl(url);
                })
              }
            >
              {pending === 'open' ? 'Opening…' : 'Open in Toudocu'}
            </button>
          )}
        </aside>
        {selected ? (
          <article className="td-detail" aria-label={selected.task.id}>
            <header className="td-detail-toolbar">
              <button className="td-back" onClick={() => select(null)}>
                <Chevron back />
                Tasks
              </button>
              <span>{selected.task.id}</span>
              <span className="td-status" data-status={selected.task.status.kind}>
                {selected.task.status.label}
              </span>
            </header>
            <div className="td-detail-scroll">
              {ancestors.length > 0 && (
                <nav className="td-ancestors" aria-label="Parent tasks">
                  {ancestors.map((entry) => (
                    <button key={entry.task.id} onClick={() => select(entry.task.id)}>
                      {entry.task.id}
                      <Chevron />
                    </button>
                  ))}
                </nav>
              )}
              <h1>{selected.task.title}</h1>
              <div className="td-task-actions">
                {scope && (
                  <button
                    className="td-primary"
                    disabled={Boolean(pending) || !selected.ready?.readyForWork}
                    onClick={() =>
                      void act('work', async () => {
                        const result = await rpc.call('work', {
                          ...scope,
                          taskId: selected.task.id,
                        });
                        navigate.toThread(result.threadId);
                      })
                    }
                  >
                    {pending === 'work' ? 'Starting…' : 'Work on task'}
                  </button>
                )}
                {scope &&
                  'threadId' in scope &&
                  view.data?.binding?.taskId !== selected.task.id && (
                    <button
                      disabled={Boolean(pending)}
                      onClick={() =>
                        void act('bind', async () => {
                          const binding = await rpc.call('bind', {
                            threadId: scope.threadId,
                            taskId: selected.task.id,
                          });
                          if (current.current.data)
                            update({ data: { ...current.current.data, binding } });
                        })
                      }
                    >
                      {pending === 'bind' ? 'Binding…' : 'Use in this thread'}
                    </button>
                  )}
                {view.data?.binding?.taskId === selected.task.id && (
                  <span className="td-muted">Linked to this thread</span>
                )}
              </div>
              {error && (
                <p role="alert" className="td-error">
                  {error}
                </p>
              )}
              {selected.ready &&
                !selected.ready.readyForWork &&
                selected.ready.issues.length > 0 && (
                  <details className="td-readiness">
                    <summary>Readiness · {selected.ready.issues.length} issues</summary>
                    <ul>
                      {selected.ready.issues.map((issue, index) => (
                        <li key={index}>{issue.message}</li>
                      ))}
                    </ul>
                  </details>
                )}
              <div className="td-detail-tabs" role="tablist" aria-label="Task details">
                {['task', 'checks', 'changes'].map((name) => (
                  <button
                    role="tab"
                    key={name}
                    aria-selected={tab === name}
                    aria-controls={contentId}
                    id={`${contentId}-${name}`}
                    tabIndex={tab === name ? 0 : -1}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const tabs = Array.from(
                        event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                          'button',
                        ),
                      );
                      const index = tabs.indexOf(event.currentTarget);
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
                              tabs.length;
                      tabs[next]?.focus();
                      tabs[next]?.click();
                    }}
                    onClick={() => {
                      setTab(name);
                      if (!scope) return;
                      const taskId = selected.task.id;
                      if (name === 'checks' && !checks)
                        void act('checks', async () => {
                          const result = await rpc.call('verify', { ...scope, taskId });
                          if (current.current.selected === taskId) setChecks(result);
                        });
                      if (name === 'changes' && !changes)
                        void act('changes', async () => {
                          const result = await rpc.call('changes', { ...scope, taskId });
                          if (current.current.selected === taskId) setChanges(result);
                        });
                    }}
                  >
                    {name === 'task' ? 'Task' : name === 'checks' ? 'Checks' : 'Changes'}
                  </button>
                ))}
              </div>
              <div id={contentId} role="tabpanel" aria-labelledby={`${contentId}-${tab}`}>
                {tab === 'task' && (
                  <Markdown
                    className="td-markdown"
                    content={selected.markdown.replace(/^# [^\n]+\n/mu, '')}
                  />
                )}
                {tab === 'checks' && (
                  <>
                    {!checks ? (
                      <p role="status" className="td-muted">
                        {pending === 'checks'
                          ? 'Reading verification plan…'
                          : 'Verification plan could not be loaded.'}
                      </p>
                    ) : (
                      <>
                        <p className="td-muted">Verification plan · commands have not run</p>
                        {checks.commands.map((command, index) => (
                          <div className="td-command" key={index}>
                            <span>{command.targets.join(', ')}</span>
                            <code>{command.command}</code>
                          </div>
                        ))}
                        {checks.commands.length === 0 && (
                          <p className="td-muted">No verification commands.</p>
                        )}
                      </>
                    )}
                  </>
                )}
                {tab === 'changes' && (
                  <>
                    {!changes ? (
                      <p role="status" className="td-muted">
                        {pending === 'changes'
                          ? 'Reading workspace changes…'
                          : 'Changes could not be loaded.'}
                      </p>
                    ) : (
                      <>
                        <p className="td-muted">{changes.changes.length} changed files</p>
                        {changes.changes.map((change) => (
                          <div className="td-command" key={change.path}>
                            <code>{change.path}</code>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
              {tab === 'task' &&
                ((children.get(selected.task.id)?.length ?? 0) > 0 ||
                  selected.task.dependsOn.length > 0) && (
                  <section className="td-related">
                    {(children.get(selected.task.id)?.length ?? 0) > 0 && (
                      <>
                        <h2>Subtasks</h2>
                        {children.get(selected.task.id)!.map((entry) => (
                          <button key={entry.task.id} onClick={() => select(entry.task.id)}>
                            <span>
                              {entry.task.id} · {entry.task.title}
                            </span>
                            <span className="td-muted">{entry.task.status.label}</span>
                            <Chevron />
                          </button>
                        ))}
                      </>
                    )}
                    {selected.task.dependsOn.length > 0 && (
                      <>
                        <h2>Dependencies</h2>
                        {selected.task.dependsOn.map((id) => (
                          <button disabled={!byId.has(id)} key={id} onClick={() => select(id)}>
                            <span>
                              {id}
                              {byId.get(id) ? ` · ${byId.get(id)!.task.title}` : ''}
                            </span>
                            <Chevron />
                          </button>
                        ))}
                      </>
                    )}
                  </section>
                )}
            </div>
          </article>
        ) : (
          <div className="td-detail td-placeholder">
            <p>Select a task to read its description.</p>
          </div>
        )}
      </div>
    </div>
  );
}
export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: 'toudocu',
    title: 'Toudocu',
    icon: 'BookOpen',
    layout: 'flush',
    component: ({ threadId }: PluginThreadPanelProps) => (
      <ToudocuPanel key={threadId} scope={{ threadId }} scopeKey={`thread:${threadId}`} />
    ),
  });
  app.slots.experimental_newThreadPanelAction({
    id: 'toudocu',
    title: 'Toudocu',
    icon: 'BookOpen',
    layout: 'flush',
    component: ({ projectId }: PluginNewThreadPanelProps) => (
      <ToudocuPanel
        key={projectId}
        scope={projectId ? { projectId } : null}
        scopeKey={`project:${projectId}`}
      />
    ),
  });
});
