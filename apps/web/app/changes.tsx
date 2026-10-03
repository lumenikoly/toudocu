import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChangeSetReportV1Schema,
  RepositoryFileListSchema,
  type ChangeSetReportV1,
  type RepositoryFileList,
} from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { ChangesDetail } from './changes-detail.js';
import {
  buildChangeTree,
  rangeFromUrl,
  rangeQuery,
  visibleChanges,
  type Change,
  type ChangeFilters,
  type ChangeTree,
  type RangeState,
} from './changes-model.js';

type TabId =
  | 'source'
  | 'file'
  | 'rendered'
  | 'semantic'
  | 'openapi'
  | 'relations'
  | 'map'
  | 'assets'
  | 'diagnostics';

function filtersFromUrl(): ChangeFilters {
  const params = new URLSearchParams(
    typeof globalThis.location === 'undefined' ? '' : globalThis.location.search,
  );
  return {
    query: params.get('q') ?? '',
    status: params.get('status') ?? '',
    type: params.get('type') ?? '',
  };
}

async function loadReport(
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<ChangeSetReportV1> {
  const response = await fetch(`/_toudocu/api/changes?${params}`, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return ChangeSetReportV1Schema.parse(body);
}

function Tree({
  node,
  selected,
  locale,
  onSelect,
}: {
  node: ChangeTree;
  selected: string;
  locale: Locale;
  onSelect: (change: Change) => void;
}) {
  const { changeStatus } = translator(locale);
  return (
    <>
      {[...node.directories]
        .sort(([left], [right]) => left.localeCompare(right, locale))
        .map(([name, child]) => (
          <details className="changes-tree-folder" open key={name}>
            <summary>{name}</summary>
            <Tree node={child} selected={selected} locale={locale} onSelect={onSelect} />
          </details>
        ))}
      {node.files.map((change) => (
        <button
          type="button"
          className={`changes-file${selected === change.path ? ' is-active' : ''}`}
          key={change.path}
          onClick={() => onSelect(change)}
        >
          <strong>{change.path.split('/').pop()}</strong>
          <span className="changes-line-stats">
            +{change.lines.added} −{change.lines.deleted}
          </span>
          <span className={`changes-file-status status-${change.status}`}>
            {changeStatus(change.status)}
          </span>
        </button>
      ))}
    </>
  );
}

function queryFor(range: RangeState, filters: ChangeFilters): URLSearchParams {
  const params = rangeQuery(range);
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params;
}

export function ChangesWorkspace({ locale }: { locale: Locale }) {
  const { text } = translator(locale);
  const [range, setRange] = useState<RangeState>(() => rangeFromUrl());
  const [appliedRange, setAppliedRange] = useState<RangeState>(() => rangeFromUrl());
  const [filters, setFilters] = useState<ChangeFilters>(() => filtersFromUrl());
  const [report, setReport] = useState<ChangeSetReportV1>();
  const reportDigest = useRef('');
  const [selectedPath, setSelectedPath] = useState('');
  const [tab, setTab] = useState<TabId>('source');
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [linkedPaths, setLinkedPaths] = useState<string[]>([]);
  const [files, setFiles] = useState<RepositoryFileList['files']>([]);
  const [filesTruncated, setFilesTruncated] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkError, setLinkError] = useState('');

  const refresh = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setError('');
      try {
        const next = await loadReport(queryFor(appliedRange, filters), signal);
        reportDigest.current = next.changeSetDigest;
        setReport(next);
        setStale(false);
        setSelectedPath((current) =>
          next.changes.some((change) => change.path === current)
            ? current
            : new URLSearchParams(globalThis.location.search).get('path') &&
                next.changes.some(
                  (change) =>
                    change.path === new URLSearchParams(globalThis.location.search).get('path'),
                )
              ? (new URLSearchParams(globalThis.location.search).get('path') ?? '')
              : (next.changes[0]?.path ?? ''),
        );
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }
    },
    [appliedRange, filters],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!report) return;
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      void loadReport(queryFor(appliedRange, filters), controller.signal)
        .then((next) => {
          if (next.changeSetDigest !== reportDigest.current) setStale(true);
        })
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === 'AbortError')) return;
        });
    }, 5000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [appliedRange, filters, report]);

  useEffect(() => {
    const params = queryFor(appliedRange, filters);
    if (selectedPath) params.set('path', selectedPath);
    if (tab !== 'source') params.set('tab', tab);
    const next = `${globalThis.location.pathname}?${params}`;
    globalThis.history.replaceState(globalThis.history.state, '', next);
  }, [appliedRange, filters, selectedPath, tab]);

  const shownChanges = useMemo(
    () => visibleChanges(report?.changes ?? [], filters, locale),
    [filters, locale, report?.changes],
  );
  const selected = report?.changes.find((change) => change.path === selectedPath);
  const linkedPath = !selected ? linkedPaths.find((path) => path === selectedPath) : undefined;

  const selectChange = (change: Change): void => {
    setSelectedPath(change.path);
    setTab('source');
  };

  const openLinkPicker = (): void => {
    setLinkOpen(true);
  };

  useEffect(() => {
    if (!linkOpen) return;
    const controller = new AbortController();
    const params = rangeQuery(appliedRange);
    if (linkQuery.trim()) params.set('q', linkQuery.trim());
    setLinkError('');
    setFiles([]);
    setFilesTruncated(false);
    setFilesLoading(true);
    void fetch(`/_toudocu/api/changes/review/repository/files?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = RepositoryFileListSchema.parse(body);
        if (controller.signal.aborted) return;
        setFiles(result.files);
        setFilesTruncated(result.truncated);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setLinkError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setFilesLoading(false);
      });
    return () => controller.abort();
  }, [appliedRange, linkOpen, linkQuery]);

  const statuses = [...new Set((report?.changes ?? []).map((change) => change.status))];
  return (
    <section className="workspace changes-workspace">
      <header className="workspace-title">
        <div>
          <h1>{text('changes')}</h1>
          <p>{text('changesDescription')}</p>
        </div>
        <button type="button" onClick={() => void refresh()}>
          {text('refresh')}
        </button>
      </header>
      <details className="changes-range-details">
        <summary>
          {text('range')}: {appliedRange.base} →{' '}
          {appliedRange.target === 'revision' ? appliedRange.revision : appliedRange.target}
        </summary>
        <form
          className="workspace-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedRange(range);
          }}
        >
          <label>
            <span>{text('base')}</span>
            <input
              value={range.base}
              onChange={(event) => setRange({ ...range, base: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>{text('mergeBase')}</span>
            <input
              value={range.branchBase}
              onChange={(event) => setRange({ ...range, branchBase: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>{text('target')}</span>
            <select
              value={range.target}
              onChange={(event) =>
                setRange({ ...range, target: event.currentTarget.value as RangeState['target'] })
              }
            >
              <option value="working-tree">{text('workingTree')}</option>
              <option value="index">index</option>
              <option value="HEAD">HEAD</option>
              <option value="revision">{text('gitRevision')}</option>
            </select>
          </label>
          {range.target === 'revision' && (
            <label>
              <span>{text('targetRevision')}</span>
              <input
                value={range.revision}
                onChange={(event) => setRange({ ...range, revision: event.currentTarget.value })}
              />
            </label>
          )}
          <button type="submit">{text('apply')}</button>
        </form>
      </details>
      {stale && (
        <div className="changes-notice" role="status">
          {text('workspaceChanged')}{' '}
          <button type="button" onClick={() => void refresh()}>
            {text('refresh')}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {report && (
        <p className="changes-summary">
          {translator(locale).format('summaryChanges', {
            count: report.changes.length,
            added: report.summary.lines.added,
            deleted: report.summary.lines.deleted,
          })}
        </p>
      )}
      <div className="workspace-grid changes-grid">
        <aside className="workspace-list changes-list-panel" aria-label={text('files')}>
          <label className="workspace-search">
            <span>{text('files')}</span>
            <input
              type="search"
              value={filters.query}
              placeholder={text('pathOrType')}
              onChange={(event) => setFilters({ ...filters, query: event.currentTarget.value })}
            />
          </label>
          <div className="changes-list-filters">
            <label>
              <span>{text('status')}</span>
              <select
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value })}
              >
                <option value="">{text('all')}</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {translator(locale).changeStatus(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{text('type')}</span>
              <select
                value={filters.type}
                onChange={(event) => setFilters({ ...filters, type: event.currentTarget.value })}
              >
                <option value="">{text('allFiles')}</option>
                <option value="documents">{text('documents')}</option>
                <option value="other">{text('otherFiles')}</option>
              </select>
            </label>
          </div>
          <div className="changes-file-list">
            <Tree
              node={buildChangeTree(shownChanges)}
              selected={selectedPath}
              locale={locale}
              onSelect={selectChange}
            />
          </div>
          {linkedPaths.length > 0 && (
            <section className="linked-files">
              <h3>{text('linkedFiles')}</h3>
              {linkedPaths.map((path) => (
                <button
                  type="button"
                  className={`changes-file${selectedPath === path ? ' is-active' : ''}`}
                  key={path}
                  onClick={() => {
                    setSelectedPath(path);
                    setTab('file');
                  }}
                >
                  <code>{path}</code>
                </button>
              ))}
            </section>
          )}
          <button
            type="button"
            className="changes-linked-add"
            onClick={() => void openLinkPicker()}
          >
            {text('linkFile')}
          </button>
        </aside>
        <section className="changes-detail" aria-live="polite">
          <ChangesDetail
            change={selected}
            linkedPath={linkedPath}
            tab={tab}
            onTab={setTab}
            locale={locale}
            reviewEnabled={appliedRange.target === 'working-tree'}
            range={appliedRange}
          />
        </section>
      </div>
      {linkOpen && (
        <dialog className="review-file-picker" open onClose={() => setLinkOpen(false)}>
          <form method="dialog" onSubmit={(event) => event.preventDefault()}>
            <header>
              <h2>{text('linkFile')}</h2>
              <button type="button" onClick={() => setLinkOpen(false)}>
                {text('close')}
              </button>
            </header>
            <input
              type="search"
              value={linkQuery}
              placeholder={text('pathOrType')}
              aria-label={text('pathOrType')}
              onChange={(event) => setLinkQuery(event.currentTarget.value)}
            />
            {linkError && <p role="alert">{linkError}</p>}
            {filesLoading && <p role="status">{text('loading')}</p>}
            {filesTruncated && <p role="status">{text('repositoryFilesTruncated')}</p>}
            <div data-file-picker-results>
              {files.map((file) => (
                <button
                  type="button"
                  key={file.path}
                  onClick={() => {
                    setLinkedPaths((current) =>
                      current.includes(file.path) ? current : [...current, file.path],
                    );
                    setSelectedPath(file.path);
                    setTab('file');
                    setLinkOpen(false);
                  }}
                >
                  <strong>{file.path.split('/').pop()}</strong>
                  <span>{file.path}</span>
                </button>
              ))}
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
