import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EditorFileListSchema,
  EditorFileResponseSchema,
  EditorPreviewResponseSchema,
  EditorSavedFileResponseSchema,
  EditorValidationResponseSchema,
  type EditorFile,
  type EditorFileList,
  type EditorFileResponse,
} from '@toudocu/contracts';
import { action, ApiError, jsonRequest } from './workspace-api.js';
import { CodeEditor, type CodeEditorHandle } from './code-editor.js';
import { buildEditorTree, EditorTree } from './editor-tree.js';
import { EditorCreateDialog } from './editor-create.js';
import { MermaidEnhancer } from './document.js';
import { translator, type Locale } from './i18n.js';
import { Icon } from './ui/index.js';

type View = 'editor' | 'preview' | 'split';
type Conflict = { kind: 'removed' } | { kind: 'changed'; digest: string };

export function EditorWorkspace({ locale }: { locale: Locale }) {
  const { text } = translator(locale);
  const [list, setList] = useState<EditorFileList>();
  const [current, setCurrent] = useState<EditorFileResponse>();
  const [content, setContent] = useState('');
  const [diagnostics, setDiagnostics] = useState<EditorFile['diagnostics']>([]);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<Conflict>();
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>('editor');
  const [filter, setFilter] = useState('');
  const [treeOpen, setTreeOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const editor = useRef<CodeEditorHandle | null>(null);
  const treeToggle = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const dirty = Boolean(current && content !== current.file.content);
  const latest = useRef({ current, content, dirty, busy });
  latest.current = { current, content, dirty, busy };

  const applyFile = useCallback((file: EditorFileResponse) => {
    generation.current += 1;
    latest.current = { ...latest.current, current: file, content: file.file.content, dirty: false };
    setCurrent(file);
    setContent(file.file.content);
    setDiagnostics(file.file.diagnostics);
    setConflict(undefined);
    setPreview('');
    setPreviewError('');
    setError('');
    setNotice('');
    if (file.file.language !== 'markdown') setView('editor');
    const url = new URL(location.href);
    url.searchParams.set('path', file.file.path);
    history.replaceState(history.state, '', `${url.pathname}${url.search}`);
    try {
      sessionStorage.setItem('toudocu-editor-path', file.file.path);
    } catch {
      /* Storage is optional. */
    }
    document.dispatchEvent(
      new CustomEvent('toudocu:editorpathchange', { detail: { path: file.file.path } }),
    );
  }, []);

  const open = async (path: string, target?: { line: number; column: number }): Promise<void> => {
    if (latest.current.busy || (latest.current.dirty && !window.confirm(text('discardChanges'))))
      return;
    const request = ++generation.current;
    const before = latest.current.content;
    setError('');
    try {
      const file = EditorFileResponseSchema.parse(
        await jsonRequest(`/_toudocu/api/editor/file?path=${encodeURIComponent(path)}`),
      );
      if (generation.current !== request) return;
      if (
        latest.current.content !== before &&
        latest.current.dirty &&
        !window.confirm(text('discardChanges'))
      )
        return;
      applyFile(file);
      setTreeOpen(false);
      if (target) {
        setView('editor');
        requestAnimationFrame(() => editor.current?.goto(target.line, target.column));
      }
    } catch (reason) {
      if (generation.current === request)
        setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    let initialized = false;
    const refresh = async (): Promise<void> => {
      if (refreshing || latest.current.busy) return;
      refreshing = true;
      try {
        const next = EditorFileListSchema.parse(
          await jsonRequest('/_toudocu/api/editor/files', { signal: controller.signal }),
        );
        if (controller.signal.aborted) return;
        setList(next);
        if (!initialized) {
          initialized = true;
          let requested = new URLSearchParams(location.search).get('path');
          try {
            requested ||= sessionStorage.getItem('toudocu-editor-path');
          } catch {
            /* Storage is optional. */
          }
          const path =
            next.files.find((file) => file.path === requested)?.path ?? next.files[0]?.path;
          if (path && !latest.current.current) await open(path);
          return;
        }
        const active = latest.current.current;
        if (!active || latest.current.busy) return;
        const fresh = next.files.find((file) => file.path === active.file.path);
        if (!fresh) {
          setConflict({ kind: 'removed' });
          return;
        }
        if (fresh.digest === active.file.digest) {
          setConflict(undefined);
          return;
        }
        if (latest.current.dirty) {
          setConflict({ kind: 'changed', digest: fresh.digest });
          return;
        }
        const request = generation.current;
        const file = EditorFileResponseSchema.parse(
          await jsonRequest(`/_toudocu/api/editor/file?path=${encodeURIComponent(fresh.path)}`, {
            signal: controller.signal,
          }),
        );
        if (
          controller.signal.aborted ||
          request !== generation.current ||
          latest.current.current !== active ||
          latest.current.busy
        )
          return;
        if (latest.current.dirty) setConflict({ kind: 'changed', digest: file.file.digest });
        else {
          applyFile(file);
          setNotice(text('editorUpdated'));
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 2500);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [locale]);

  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(
        sessionStorage.getItem('toudocu-editor-collapsed') ?? '[]',
      );
      if (
        Array.isArray(stored) &&
        stored.every((entry): entry is string => typeof entry === 'string')
      )
        setCollapsed(new Set(stored));
    } catch {
      /* Storage is optional. */
    }
  }, []);

  const validate = async (signal?: AbortSignal): Promise<void> => {
    const active = latest.current.current;
    if (!active) return;
    const source = latest.current.content;
    const request = generation.current;
    const kind = view !== 'editor' && active.file.language === 'markdown' ? 'preview' : 'validate';
    try {
      const value = await jsonRequest(
        `/_toudocu/api/editor/${kind}`,
        action('POST', kind, { path: active.file.path, content: source }, signal),
      );
      if (signal?.aborted || generation.current !== request || latest.current.content !== source)
        return;
      if (kind === 'preview') {
        const result = EditorPreviewResponseSchema.parse(value);
        setPreview(result.html);
        setPreviewError('');
        setDiagnostics(result.diagnostics);
      } else setDiagnostics(EditorValidationResponseSchema.parse(value).diagnostics);
    } catch (reason) {
      if (signal?.aborted || generation.current !== request || latest.current.content !== source)
        return;
      const message = reason instanceof Error ? reason.message : String(reason);
      if (kind === 'preview') {
        setPreview('');
        setPreviewError(message);
      } else setError(message);
    }
  };
  useEffect(() => {
    if (!current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => void validate(controller.signal), 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [current?.file.path, current?.file.digest, content, view]);

  const save = async (overwrite = false): Promise<void> => {
    const active = latest.current.current;
    if (
      !active ||
      latest.current.busy ||
      (!latest.current.dirty && !overwrite) ||
      conflict?.kind === 'removed'
    )
      return;
    const source = latest.current.content;
    const acceptedDigest = overwrite && conflict?.kind === 'changed' ? conflict.digest : undefined;
    generation.current += 1;
    latest.current.busy = true;
    setBusy(true);
    setError('');
    const put = (digest: string, confirmOverwrite: boolean) =>
      jsonRequest(
        '/_toudocu/api/editor/file',
        action('PUT', 'save', {
          path: active.file.path,
          content: source,
          expectedDigest: digest,
          confirmOverwrite,
        }),
      );
    try {
      let value: unknown;
      try {
        value = await put(active.file.digest, false);
      } catch (reason) {
        // Register the optimistic-lock conflict before confirming that exact disk version.
        if (
          acceptedDigest &&
          reason instanceof ApiError &&
          reason.status === 409 &&
          typeof reason.details === 'object' &&
          reason.details !== null &&
          'digest' in reason.details &&
          reason.details.digest === acceptedDigest
        )
          value = await put(acceptedDigest, true);
        else throw reason;
      }
      const result = EditorSavedFileResponseSchema.parse(value);
      const pending = latest.current.content;
      applyFile(result);
      if (pending !== source) {
        latest.current.content = pending;
        latest.current.dirty = pending !== result.file.content;
        setContent(pending);
      }
      setNotice(text('editorSaved'));
      setList(EditorFileListSchema.parse(await jsonRequest('/_toudocu/api/editor/files')));
    } catch (reason) {
      if (
        reason instanceof ApiError &&
        reason.status === 409 &&
        typeof reason.details === 'object' &&
        reason.details !== null &&
        'digest' in reason.details &&
        typeof reason.details.digest === 'string'
      )
        setConflict({ kind: 'changed', digest: reason.details.digest });
      else setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      latest.current.busy = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    const previous = document.title;
    if (dirty) document.title = `${text('editorModified')} · ${previous}`;
    return () => {
      document.title = previous;
    };
  }, [dirty, locale]);

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void save();
      }
      if (event.key === 'Escape' && treeOpen) {
        setTreeOpen(false);
        treeToggle.current?.focus();
      }
    };
    const unload = (event: BeforeUnloadEvent): void => {
      if (latest.current.dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const follow = (event: MouseEvent): void => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !link ||
        event.defaultPrevented ||
        event.button ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        link.target === '_blank' ||
        link.hasAttribute('download')
      )
        return;
      const target = new URL(link.href, location.href);
      if (target.pathname === location.pathname && target.search === location.search) return;
      if (
        (latest.current.dirty || latest.current.busy) &&
        !window.confirm(text('discardChanges'))
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', key);
    document.addEventListener('click', follow, true);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('keydown', key);
      document.removeEventListener('click', follow, true);
      window.removeEventListener('beforeunload', unload);
    };
  }, [content, current, conflict, treeOpen, locale]);

  const visible = useMemo(
    () =>
      (list?.files ?? []).filter((file) =>
        `${file.path} ${file.title ?? ''}`
          .toLocaleLowerCase(locale)
          .includes(filter.trim().toLocaleLowerCase(locale)),
      ),
    [list, filter, locale],
  );
  const entries = useMemo(() => buildEditorTree(visible), [visible]);
  const download = (): void => {
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob([latest.current.content], { type: 'text/plain;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `${current.file.path.split('/').at(-1) ?? 'document'}.unsaved`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return (
    <div className="workspace editor-workspace">
      <header className="workspace-title editor-toolbar">
        <div>
          <h1>{text('editor')}</h1>
          {dirty && <span className="editor-dirty">{text('editorModified')}</span>}
        </div>
        <div className="workspace-actions">
          <button
            ref={treeToggle}
            className="editor-tree-toggle ui-icon-button"
            aria-label={text('files')}
            title={text('files')}
            type="button"
            aria-expanded={treeOpen}
            aria-controls="editor-files"
            onClick={() => setTreeOpen(!treeOpen)}
          >
            <Icon name="folder" />
          </button>
          {current && (
            <a
              className="ui-icon-button"
              aria-label={text('source')}
              title={text('source')}
              target="_blank"
              rel="noopener"
              href={`/_toudocu/api/editor/file?raw=1&path=${encodeURIComponent(current.file.path)}`}
            >
              <Icon name="file" />
            </a>
          )}
          <button
            type="button"
            disabled={busy || !list}
            onClick={() => {
              if (!dirty || window.confirm(text('discardChanges'))) setCreateOpen(true);
            }}
          >
            <Icon name="plus" />
            {text('create')}
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={!dirty || busy || conflict?.kind === 'removed'}
            onClick={() => void save()}
          >
            {text(busy ? 'editorSaving' : 'save')}
          </button>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <div className="workspace-grid">
        <aside
          id="editor-files"
          className={`workspace-list editor-file-tree${treeOpen ? ' is-open' : ''}`}
        >
          <label className="workspace-search">
            <span>{text('documents')}</span>
            <input
              type="search"
              placeholder={text('filterByPath')}
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
          <nav aria-label={text('documents')}>
            <EditorTree
              entries={entries}
              active={current?.file.path ?? ''}
              collapsed={collapsed}
              filtering={Boolean(filter.trim())}
              onOpen={(path) => void open(path)}
              onToggle={(path, expanded) =>
                setCollapsed((prior) => {
                  const next = new Set(prior);
                  if (expanded) next.delete(path);
                  else next.add(path);
                  try {
                    sessionStorage.setItem('toudocu-editor-collapsed', JSON.stringify([...next]));
                  } catch {
                    /* Storage is optional. */
                  }
                  return next;
                })
              }
            />
          </nav>
          {list && !visible.length && <p>{text('noResults')}</p>}
        </aside>
        <section className="editor-main">
          {conflict && (
            <div className="editor-conflict" role="alert">
              <p>{text(conflict.kind === 'removed' ? 'openedFileRemoved' : 'editorConflict')}</p>
              <div className="workspace-actions">
                <button type="button" onClick={download}>
                  {text('downloadMyChanges')}
                </button>
                {conflict.kind === 'changed' && current && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void open(current.file.path)}
                    >
                      {text('loadDiskVersion')}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void save(true)}>
                      {text('overwriteCurrent')}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          {current ? (
            <>
              <div className="editor-file-heading">
                <h2>{current.file.path.split('/').at(-1)}</h2>
                <code title={current.file.path}>{current.file.path}</code>
              </div>
              <div className="editor-view-tabs" role="tablist" aria-label={text('editorView')}>
                {(['editor', 'preview', 'split'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    id={`editor-tab-${mode}`}
                    aria-controls="editor-panel"
                    aria-selected={view === mode}
                    tabIndex={view === mode ? 0 : -1}
                    disabled={mode !== 'editor' && current.file.language !== 'markdown'}
                    onClick={() => setView(mode)}
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const tabs = [
                        ...event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                          'button:not(:disabled)',
                        ),
                      ];
                      const index = tabs.indexOf(event.currentTarget);
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) %
                              tabs.length;
                      tabs[next]?.click();
                      tabs[next]?.focus();
                    }}
                  >
                    {text(mode)}
                  </button>
                ))}
              </div>
              <div
                id="editor-panel"
                role="tabpanel"
                aria-labelledby={`editor-tab-${view}`}
                className={`editor-panes is-${view}`}
              >
                <div hidden={view === 'preview'} className="editor-source-pane">
                  <CodeEditor
                    file={current.file}
                    content={content}
                    diagnostics={diagnostics}
                    handle={editor}
                    onChange={(value) => {
                      latest.current.content = value;
                      latest.current.dirty = value !== latest.current.current?.file.content;
                      setContent(value);
                    }}
                  />
                </div>
                {view !== 'editor' && (
                  <section className="document-body preview" aria-label={text('preview')}>
                    {previewError ? (
                      <p role="alert">{previewError}</p>
                    ) : preview ? (
                      <>
                        <div dangerouslySetInnerHTML={{ __html: preview }} />
                        <MermaidEnhancer
                          pageId={`${current.file.path}:${preview}`}
                          locale={locale}
                        />
                      </>
                    ) : (
                      <p>{text('editorPreviewEmpty')}</p>
                    )}
                  </section>
                )}
              </div>
              <section className="editor-diagnostics" aria-labelledby="editor-diagnostics-title">
                <header>
                  <h2 id="editor-diagnostics-title">
                    {text('editorDiagnostics')} <span>{diagnostics.length}</span>
                  </h2>
                  <button type="button" onClick={() => void validate()}>
                    {text('validate')}
                  </button>
                </header>
                {diagnostics.length ? (
                  <ul>
                    {diagnostics.map((item, index) => (
                      <li key={`${item.code}:${item.path}:${item.line}:${index}`}>
                        <button
                          type="button"
                          onClick={() => {
                            if (item.path && item.path !== current.file.path)
                              void open(item.path, item);
                            else {
                              setView('editor');
                              requestAnimationFrame(() =>
                                editor.current?.goto(item.line, item.column),
                              );
                            }
                          }}
                        >
                          <strong data-severity={item.severity}>
                            {text(
                              item.severity === 'error'
                                ? 'editorValidationError'
                                : item.severity === 'warning'
                                  ? 'editorValidationWarning'
                                  : 'editorValidationInfo',
                            )}{' '}
                            · {item.code}
                          </strong>
                          <span>{item.message}</span>
                          <code>
                            {item.path || current.file.path}:{item.line || 1}:{item.column || 1}
                          </code>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{text('noDiagnostics')}</p>
                )}
              </section>
            </>
          ) : (
            <p className="ui-empty-state">
              {text(
                list ? (list.files.length ? 'editorSelectFile' : 'editorEmpty') : 'editorLoading',
              )}
            </p>
          )}
        </section>
      </div>
      {createOpen && list && (
        <EditorCreateDialog
          templates={list.templates}
          locale={locale}
          onClose={() => setCreateOpen(false)}
          onCreated={(file) => {
            applyFile(file);
            setCreateOpen(false);
            void jsonRequest('/_toudocu/api/editor/files')
              .then(EditorFileListSchema.parse)
              .then(setList)
              .catch((reason: unknown) =>
                setError(reason instanceof Error ? reason.message : String(reason)),
              );
          }}
        />
      )}
    </div>
  );
}
