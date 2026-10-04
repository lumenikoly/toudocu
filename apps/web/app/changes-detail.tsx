import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { RepositoryFileResponseSchema, type RepositoryFileResponse } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { Icon } from './ui/index.js';
import { rangeQuery, type Change, type RangeState } from './changes-model.js';

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
type DiffLayout = 'unified' | 'split';
type ReviewPosition = { line: number; column: number };
type ReviewRange = { start: ReviewPosition; end: ReviewPosition };
type ReviewTarget = { kind: 'file'; path: string; range: ReviewRange | null };
type ReviewSelection = { side: 'old' | 'new'; range: ReviewRange; selectedText: string };
type DiffLine = {
  text: string;
  side: 'old' | 'new' | 'context';
  oldLine?: number;
  newLine?: number;
};

function copy(value: string): void {
  void navigator.clipboard?.writeText(value);
}

function statusLabel(locale: Locale, value: string): string {
  const { changeStatus } = translator(locale);
  return changeStatus(value);
}

function languageFor(path: string): string {
  if (/\.ya?ml$/iu.test(path)) return 'yaml';
  if (/\.json$/iu.test(path)) return 'json';
  if (/\.tsx?$/iu.test(path)) return 'typescript';
  if (/\.jsx?$/iu.test(path)) return 'javascript';
  if (/\.md$/iu.test(path)) return 'markdown';
  return 'text';
}

function parseDiffLines(patch: string): DiffLine[] {
  let oldLine = 0;
  let newLine = 0;
  return patch.split('\n').map((text) => {
    const hunk = text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      return { text, side: 'context' };
    }
    if (text.startsWith('-')) {
      const line = { text, side: 'old' as const, oldLine };
      oldLine += 1;
      return line;
    }
    if (text.startsWith('+')) {
      const line = { text, side: 'new' as const, newLine };
      newLine += 1;
      return line;
    }
    const line = { text, side: 'context' as const, oldLine, newLine };
    oldLine += 1;
    newLine += 1;
    return line;
  });
}

function linesForSide(lines: DiffLine[], side: 'unified' | 'before' | 'after'): DiffLine[] {
  if (side === 'unified') return lines;
  return lines.filter(
    (line) =>
      line.text.startsWith('@@') ||
      line.side === 'context' ||
      (side === 'before' && line.side === 'old') ||
      (side === 'after' && line.side === 'new'),
  );
}

function textColumn(container: Node, offset: number, line: HTMLElement, fallback: number): number {
  const content = line.querySelector<HTMLElement>('.diff-line-content');
  if (!content) return fallback;
  try {
    const point = document.createRange();
    point.setStart(content, 0);
    point.setEnd(container, offset);
    return Math.max(1, point.toString().length + 1);
  } catch {
    return fallback;
  }
}

function lineForNode(node: Node): HTMLElement | undefined {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLElement>('[data-review-line]') ?? undefined;
}

function SourceDiff({
  change,
  locale,
  reviewEnabled,
}: {
  change: Change;
  locale: Locale;
  reviewEnabled: boolean;
}) {
  const { text } = translator(locale);
  const [layout, setLayout] = useState<DiffLayout>('unified');
  const [selection, setSelection] = useState<ReviewSelection>();
  const [selectionError, setSelectionError] = useState(false);
  const hunks = change.sourceDiffHunks.length
    ? change.sourceDiffHunks
    : change.sourceDiff
      ? [{ id: 'diff', header: '', patch: change.sourceDiff }]
      : [];
  const inspectSelection = (
    event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
  ): void => {
    const native = globalThis.getSelection?.();
    const selectedText = native?.toString().trim() ?? '';
    if (!native || !selectedText) {
      setSelection(undefined);
      setSelectionError(false);
      return;
    }
    const selectedLines = [
      ...event.currentTarget.querySelectorAll<HTMLElement>('[data-review-line]'),
    ].filter((line) => {
      try {
        return native.rangeCount > 0 && native.getRangeAt(0).intersectsNode(line);
      } catch {
        return false;
      }
    });
    const sides = new Set(selectedLines.map((line) => line.dataset.reviewSide));
    if (sides.size !== 1 || selectedLines.length === 0) {
      setSelection(undefined);
      setSelectionError(true);
      return;
    }
    const side = sides.values().next().value;
    if (side !== 'old' && side !== 'new') {
      setSelection(undefined);
      setSelectionError(true);
      return;
    }
    const nativeRange = native.getRangeAt(0);
    const first = lineForNode(nativeRange.startContainer) ?? selectedLines[0];
    const last = lineForNode(nativeRange.endContainer) ?? selectedLines[selectedLines.length - 1];
    if (!first || !last) {
      setSelection(undefined);
      setSelectionError(true);
      return;
    }
    const startLine = Number(first.dataset.reviewLine);
    const endLine = Number(last.dataset.reviewLine);
    if (!Number.isInteger(startLine) || !Number.isInteger(endLine)) {
      setSelection(undefined);
      setSelectionError(true);
      return;
    }
    const startColumn = textColumn(nativeRange.startContainer, nativeRange.startOffset, first, 1);
    const endColumn = textColumn(nativeRange.endContainer, nativeRange.endOffset, last, 1);
    const ordered = startLine <= endLine;
    setSelection({
      side,
      selectedText,
      range: {
        start: {
          line: ordered ? startLine : endLine,
          column: Math.max(1, ordered ? startColumn : endColumn),
        },
        end: {
          line: ordered ? endLine : startLine,
          column: Math.max(1, ordered ? endColumn : startColumn),
        },
      },
    });
    setSelectionError(false);
  };
  const discussSelection = (): void => {
    if (!reviewEnabled || !selection) return;
    const target: ReviewTarget = { kind: 'file', path: change.path, range: selection.range };
    globalThis.document.dispatchEvent(
      new CustomEvent<{ target: ReviewTarget; selection: { selectedText: string } }>(
        'toudocu:discussion-compose',
        { detail: { target, selection: { selectedText: selection.selectedText } } },
      ),
    );
  };
  if (!hunks.length) return <p className="empty-note">{text('noSourceDiff')}</p>;
  return (
    <section className="changes-source-view">
      <header className="diff-heading">
        <h3>{text('sourceChanges')}</h3>
        <div className="workspace-actions" role="group" aria-label={text('diffLayout')}>
          <button
            type="button"
            aria-pressed={layout === 'unified'}
            onClick={() => setLayout('unified')}
          >
            {text('unified')}
          </button>
          <button
            type="button"
            aria-pressed={layout === 'split'}
            onClick={() => setLayout('split')}
          >
            {text('split')}
          </button>
        </div>
      </header>
      <nav className="diff-hunk-nav" aria-label={text('diffHunks')}>
        {hunks.map((hunk, index) => (
          <a key={hunk.id} href={'#change-hunk-' + index}>
            {hunk.header || text('hunk') + ' ' + (index + 1)}
          </a>
        ))}
      </nav>
      {selectionError && (
        <p className="review-selection-error" role="status">
          {text('mixedSelection')}
        </p>
      )}
      {selection && (
        <div
          className="review-selection-actions"
          role="toolbar"
          aria-label={text('reviewSelection')}
        >
          <span>
            {text('reviewLine')}: {selection.range.start.line}–{selection.range.end.line}
          </span>
          <button type="button" disabled={!reviewEnabled} onClick={discussSelection}>
            {text('commentSelection')}
          </button>
        </div>
      )}
      <div className={'source-diff-list is-' + layout}>
        {hunks.map((hunk, index) => {
          const lines = parseDiffLines(hunk.patch);
          return (
            <section id={'change-hunk-' + index} className="source-diff-hunk" key={hunk.id}>
              <header>
                <code>{hunk.header}</code>
                <button
                  type="button"
                  className="ui-icon-button"
                  aria-label={text('copyHunk')}
                  title={text('copyHunk')}
                  onClick={() => copy(hunk.patch)}
                >
                  <Icon name="clipboard" />
                </button>
              </header>
              <div
                className={layout === 'split' ? 'source-diff-split' : undefined}
                onMouseUp={inspectSelection}
                onKeyUp={inspectSelection}
              >
                {(layout === 'split' ? (['before', 'after'] as const) : (['unified'] as const)).map(
                  (side) => (
                    <pre className="source-diff" key={side}>
                      <code>
                        {linesForSide(lines, side).map((line, lineIndex) => {
                          const reviewSide =
                            side === 'before'
                              ? 'old'
                              : side === 'after'
                                ? 'new'
                                : line.side === 'old'
                                  ? 'old'
                                  : 'new';
                          const reviewLine = reviewSide === 'old' ? line.oldLine : line.newLine;
                          const numbered = reviewLine !== undefined;
                          return (
                            <span
                              key={side + ':' + lineIndex}
                              className="diff-line"
                              data-diff={
                                line.text.startsWith('+')
                                  ? 'added'
                                  : line.text.startsWith('-')
                                    ? 'removed'
                                    : line.text.startsWith('@@')
                                      ? 'hunk'
                                      : undefined
                              }
                              data-review-side={numbered ? reviewSide : undefined}
                              data-review-line={numbered ? reviewLine : undefined}
                            >
                              <span className="diff-line-number">{line.oldLine ?? ''}</span>
                              <span className="diff-line-number">{line.newLine ?? ''}</span>
                              <span className="diff-line-marker">{line.text[0] ?? ' '}</span>
                              <span className="diff-line-content">{line.text.slice(1)}</span>
                            </span>
                          );
                        })}
                      </code>
                    </pre>
                  ),
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function FileView({
  path,
  oldPath,
  range,
  locale,
}: {
  path: string;
  oldPath?: string | undefined;
  range: RangeState;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const [file, setFile] = useState<RepositoryFileResponse>();
  const [side, setSide] = useState<'before' | 'current'>('current');
  const [error, setError] = useState('');
  const query = rangeQuery(range);
  query.set('path', path);
  if (oldPath) query.set('oldPath', oldPath);
  const params = query.toString();
  useEffect(() => {
    const controller = new AbortController();
    setFile(undefined);
    setError('');
    void fetch(`/_toudocu/api/changes/review/repository/file?${params}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return RepositoryFileResponseSchema.parse(body);
      })
      .then((response) => {
        if (controller.signal.aborted) return;
        setFile(response);
        setSide(response.current.available ? 'current' : 'before');
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [params]);
  if (error) return <p role="alert">{error}</p>;
  if (!file) return <p role="status">{text('loading')}</p>;
  const selected = file[side];
  return (
    <section className="change-file-view">
      <header>
        <h3>{text('fileContent')}</h3>
        <code>{languageFor(path)}</code>
        <div role="group" aria-label={text('fileContent')}>
          <button type="button" aria-pressed={side === 'before'} onClick={() => setSide('before')}>
            {text('before')}
          </button>
          <button
            type="button"
            aria-pressed={side === 'current'}
            onClick={() => setSide('current')}
          >
            {text('after')}
          </button>
        </div>
      </header>
      <p>
        <code>{selected.path}</code>
      </p>
      {!selected.available ? (
        <p>{text('repositoryFileMissing')}</p>
      ) : selected.tooLarge ? (
        <p>{text('repositoryFileTooLarge')}</p>
      ) : selected.binary ? (
        <p>{text('repositoryFileBinary')}</p>
      ) : (
        <pre className="source-diff">
          <code>{selected.content}</code>
        </pre>
      )}
    </section>
  );
}

type RenderedSection = Change['renderedSections'][number];

function renderedSectionLabel(section: RenderedSection, locale: Locale): string {
  const { text } = translator(locale);
  const status = section.status.toLocaleLowerCase();
  if (status.includes('add')) return text('renderedSectionAdded');
  if (status.includes('remove') || status.includes('delete')) return text('renderedSectionRemoved');
  if (status.includes('move')) return text('renderedSectionMoved');
  return text('renderedSectionChanged');
}

function RenderedColumn({
  html,
  side,
  sections,
  locale,
}: {
  html: string | undefined;
  side: 'before' | 'after';
  sections: readonly RenderedSection[];
  locale: Locale;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const added: HTMLElement[] = [];
    for (const section of sections) {
      const anchor = side === 'before' ? section.anchorBefore : section.anchorAfter;
      if (!anchor) continue;
      const heading = [...root.querySelectorAll<HTMLElement>('[id]')].find(
        (element) => element.id === anchor,
      );
      if (!heading) continue;
      const status = section.status.toLocaleLowerCase().replace(/[^a-z0-9-]/gu, '-');
      heading.classList.add('rendered-section-heading', `status-${status}`);
      const marker = document.createElement('span');
      marker.className = 'rendered-section-marker';
      marker.dataset.renderedMarker = 'true';
      marker.textContent = renderedSectionLabel(section, locale);
      heading.append(marker);
      added.push(marker);
      for (
        let sibling = heading.nextElementSibling;
        sibling;
        sibling = sibling.nextElementSibling
      ) {
        if (/^H[1-6]$/u.test(sibling.tagName)) break;
        if (sibling instanceof HTMLElement) {
          sibling.classList.add('rendered-section-content', `status-${status}`);
          added.push(sibling);
        }
      }
    }
    return () => {
      for (const element of added) {
        if (element.dataset.renderedMarker) element.remove();
        else
          element.className = element.className
            .split(/\s+/u)
            .filter((name) => !name.startsWith('rendered-section-') && !name.startsWith('status-'))
            .join(' ');
      }
    };
  }, [locale, sections, side, html]);
  if (!html)
    return (
      <p className="empty-note">
        {side === 'before'
          ? translator(locale).text('documentMissing')
          : translator(locale).text('documentDeleted')}
      </p>
    );
  return <div ref={host} dangerouslySetInnerHTML={{ __html: html }} />;
}

function RenderedView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  if (change.renderedBefore === undefined && change.renderedAfter === undefined) {
    return <p className="empty-note">{text('noRenderedDiff')}</p>;
  }
  return (
    <div className="rendered-diff rendered-diff-marked">
      <section>
        <h3>{text('before')}</h3>
        <RenderedColumn
          html={change.renderedBefore}
          side="before"
          sections={change.renderedSections}
          locale={locale}
        />
      </section>
      <section>
        <h3>{text('after')}</h3>
        <RenderedColumn
          html={change.renderedAfter}
          side="after"
          sections={change.renderedSections}
          locale={locale}
        />
      </section>
    </div>
  );
}

function SemanticView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  if (!change.semanticChanges.length)
    return <p className="empty-note">{text('noSemanticChanges')}</p>;
  return (
    <ol className="semantic-list">
      {change.semanticChanges.map((item, index) => (
        <li key={`${item.kind}:${index}`}>
          <strong>{item.kind}</strong>
          {item.compatibility && <span className="compatibility">{item.compatibility}</span>}
          <p>{item.summary}</p>
          {(item.before !== undefined || item.after !== undefined) && (
            <div className="semantic-values">
              <pre>{JSON.stringify(item.before, null, 2) ?? '—'}</pre>
              <pre>{JSON.stringify(item.after, null, 2) ?? '—'}</pre>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

function OpenApiView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  return (
    <section className="openapi-change-view">
      <header className="change-subview-heading">
        <div>
          <span className="entity-kicker">OpenAPI</span>
          <h3>{text('openApiDiff')}</h3>
        </div>
        <code>{change.path}</code>
      </header>
      {change.semanticChanges.length ? (
        <ol className="semantic-list">
          {change.semanticChanges.map((item, index) => (
            <li key={`${item.kind}:${item.entity.id ?? item.entity.title ?? ''}:${index}`}>
              <div className="openapi-change-line">
                <strong>{item.kind}</strong>
                {item.compatibility && <span className="compatibility">{item.compatibility}</span>}
              </div>
              <p>{item.summary}</p>
              {(item.before !== undefined || item.after !== undefined) && (
                <div className="semantic-values">
                  <pre>{JSON.stringify(item.before, null, 2) ?? '—'}</pre>
                  <pre>{JSON.stringify(item.after, null, 2) ?? '—'}</pre>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-note">{text('noSemanticChanges')}</p>
      )}
    </section>
  );
}

function RelationsView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  if (!change.relationChanges.length)
    return <p className="empty-note">{text('noRelationChanges')}</p>;
  return (
    <ul className="relations">
      {change.relationChanges.map((item, index) => (
        <li key={`${item.kind}:${index}`}>
          <code>{item.kind}</code> {item.source.id ?? item.source.title ?? '—'} →{' '}
          {item.target.id ?? item.target.title ?? '—'}
        </li>
      ))}
    </ul>
  );
}

function MapView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  if (!change.screen) return <p className="empty-note">{text('noScreenDiff')}</p>;
  return (
    <div className="change-metadata-view">
      <h3>{text('screenMapChanges')}</h3>
      <pre>{JSON.stringify(change.screen, null, 2)}</pre>
    </div>
  );
}

type DiagramViewState = { zoom: number; x: number; y: number };

function diagramSourceDiff(before: string, after: string): string {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  const result: string[] = [];
  const size = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < size; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      if (oldLine !== undefined) result.push(`  ${oldLine}`);
      continue;
    }
    if (oldLine !== undefined) result.push(`- ${oldLine}`);
    if (newLine !== undefined) result.push(`+ ${newLine}`);
  }
  return result.join('\n');
}

function MermaidCanvas({
  source,
  view,
  onChange,
}: {
  source: string;
  view: DiagramViewState;
  onChange: (next: Partial<DiagramViewState>) => void;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const diagram = useRef<HTMLPreElement>(null);
  const id = useId().replace(/[^a-z\d_-]/giu, '');
  const viewRef = useRef(view);
  const onChangeRef = useRef(onChange);
  viewRef.current = view;
  onChangeRef.current = onChange;
  useEffect(() => {
    let active = true;
    void import('mermaid')
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          securityLevel: 'strict',
          startOnLoad: false,
          theme: globalThis.document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default',
        });
        const result = await mermaid.render(`change-diagram-${id}`, source);
        const target = diagram.current;
        if (!active || !target) return;
        target.innerHTML = result.svg;
        result.bindFunctions?.(target);
      })
      .catch(() => {
        if (active && diagram.current) diagram.current.textContent = source;
      });
    return () => {
      active = false;
      diagram.current?.replaceChildren();
    };
  }, [id, source]);
  useEffect(() => {
    const root = canvas.current;
    if (!root) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let gesture:
      | {
          kind: 'pan';
          id: number;
          x: number;
          y: number;
          startX: number;
          startY: number;
          moved: boolean;
        }
      | {
          kind: 'pinch';
          distance: number;
          zoom: number;
          contentX: number;
          contentY: number;
        }
      | null = null;
    let suppressClick = false;
    let clickTimer = 0;
    const localPoint = (x: number, y: number): { x: number; y: number } => {
      const rect = root.getBoundingClientRect();
      return { x: x - rect.left, y: y - rect.top };
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const current = viewRef.current;
      const centerX = root.clientWidth / 2;
      const centerY = root.clientHeight / 2;
      if (pointers.size >= 2) {
        const [first, second] = [...pointers.values()];
        if (!first || !second) return;
        const middle = localPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
        gesture = {
          kind: 'pinch',
          distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
          zoom: current.zoom,
          contentX: (middle.x - centerX - current.x) / current.zoom,
          contentY: (middle.y - centerY - current.y) / current.zoom,
        };
        event.preventDefault();
      } else {
        gesture = {
          kind: 'pan',
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          startX: current.x,
          startY: current.y,
          moved: false,
        };
      }
    };
    const onPointerMove = (event: PointerEvent): void => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const activeGesture = gesture;
      const current = viewRef.current;
      const centerX = root.clientWidth / 2;
      const centerY = root.clientHeight / 2;
      if (activeGesture?.kind === 'pinch' && pointers.size >= 2) {
        const [first, second] = [...pointers.values()];
        if (!first || !second) return;
        const middle = localPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
        const zoom = Math.min(
          2.5,
          Math.max(
            0.5,
            activeGesture.zoom *
              (Math.hypot(first.x - second.x, first.y - second.y) / activeGesture.distance),
          ),
        );
        onChangeRef.current({
          zoom,
          x: middle.x - centerX - activeGesture.contentX * zoom,
          y: middle.y - centerY - activeGesture.contentY * zoom,
        });
        event.preventDefault();
      } else if (activeGesture?.kind === 'pan' && activeGesture.id === event.pointerId) {
        if (Math.hypot(event.clientX - activeGesture.x, event.clientY - activeGesture.y) > 3) {
          activeGesture.moved = true;
        }
        if (!activeGesture.moved) return;
        onChangeRef.current({
          x: activeGesture.startX + event.clientX - activeGesture.x,
          y: activeGesture.startY + event.clientY - activeGesture.y,
        });
        event.preventDefault();
      }
    };
    const onPointerUp = (event: PointerEvent): void => {
      pointers.delete(event.pointerId);
      if (gesture?.kind === 'pan' && gesture.id === event.pointerId && gesture.moved) {
        suppressClick = true;
        window.clearTimeout(clickTimer);
        clickTimer = window.setTimeout(() => (suppressClick = false), 0);
      }
      gesture = pointers.size >= 2 ? gesture : null;
    };
    const onClick = (event: globalThis.MouseEvent): void => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const current = viewRef.current;
      const local = localPoint(event.clientX, event.clientY);
      const centerX = root.clientWidth / 2;
      const centerY = root.clientHeight / 2;
      const contentX = (local.x - centerX - current.x) / current.zoom;
      const contentY = (local.y - centerY - current.y) / current.zoom;
      const zoom = Math.min(2.5, Math.max(0.5, current.zoom * Math.exp(-event.deltaY * 0.002)));
      onChangeRef.current({
        zoom,
        x: local.x - centerX - contentX * zoom,
        y: local.y - centerY - contentY * zoom,
      });
    };
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('click', onClick, true);
    root.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('click', onClick, true);
      root.removeEventListener('wheel', onWheel);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.clearTimeout(clickTimer);
    };
  }, []);
  return (
    <div className="mermaid-canvas" ref={canvas}>
      <pre
        className="mermaid"
        ref={diagram}
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      />
    </div>
  );
}

function DiagramView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  const [views, setViews] = useState<Record<string, DiagramViewState>>({});
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  if (!change.mermaidBlocks.length) return <MapView change={change} locale={locale} />;
  const viewFor = (id: string): DiagramViewState => views[id] ?? { zoom: 1, x: 0, y: 0 };
  const update = (id: string, next: Partial<DiagramViewState>): void =>
    setViews((current) => ({ ...current, [id]: { ...viewFor(id), ...next } }));
  return (
    <div className="change-metadata-view mermaid-change-view">
      {change.mermaidBlocks.map((block) => {
        const view = viewFor(block.id);
        return (
          <section
            key={block.id}
            className="mermaid-change"
            ref={(element) => {
              sectionRefs.current[block.id] = element;
            }}
          >
            <header className="change-subview-heading">
              <div>
                <span className="entity-kicker">Mermaid · {block.status}</span>
                <h3>{block.caption || block.id}</h3>
              </div>
              <div className="mermaid-controls" role="group" aria-label={text('diagramControls')}>
                <button
                  type="button"
                  onClick={() => update(block.id, { zoom: Math.max(0.5, view.zoom - 0.2) })}
                >
                  {text('zoomOut')}
                </button>
                <button type="button" onClick={() => update(block.id, { zoom: 1, x: 0, y: 0 })}>
                  {text('resetZoom')}
                </button>
                <button
                  type="button"
                  onClick={() => update(block.id, { zoom: Math.min(2.5, view.zoom + 0.2) })}
                >
                  {text('zoomIn')}
                </button>
                <button
                  type="button"
                  onClick={() => void sectionRefs.current[block.id]?.requestFullscreen?.()}
                >
                  {text('fullscreen')}
                </button>
              </div>
            </header>
            <div className="rendered-diff mermaid-columns">
              <div>
                <h4>{text('before')}</h4>
                {block.before ? (
                  <MermaidCanvas
                    source={block.before}
                    view={view}
                    onChange={(next) => update(block.id, next)}
                  />
                ) : (
                  <p className="empty-note">{text('documentMissing')}</p>
                )}
              </div>
              <div>
                <h4>{text('after')}</h4>
                {block.after ? (
                  <MermaidCanvas
                    source={block.after}
                    view={view}
                    onChange={(next) => update(block.id, next)}
                  />
                ) : (
                  <p className="empty-note">{text('documentDeleted')}</p>
                )}
              </div>
            </div>
            <details className="mermaid-source">
              <summary>{text('sourceChanges')}</summary>
              <pre>
                {diagramSourceDiff(block.before ?? '', block.after ?? '') || text('noSourceDiff')}
              </pre>
            </details>
          </section>
        );
      })}
    </div>
  );
}

type AssetMetadata = NonNullable<NonNullable<Change['asset']>['before']>;

function AssetPreview({
  meta,
  label,
  locale,
}: {
  meta: AssetMetadata | undefined;
  label: string;
  locale: Locale;
}) {
  const { text, format } = translator(locale);
  const ratio = meta?.aspectRatio && meta.aspectRatio > 0 ? meta.aspectRatio : 1.6;
  return (
    <section className="asset-preview-panel">
      <h4>{label}</h4>
      <div
        className="asset-preview"
        style={{ aspectRatio: String(ratio) }}
        aria-label={text('assetPreview')}
      >
        <span className="asset-preview-shape" aria-hidden="true" />
        {!meta && <span className="asset-preview-missing">{text('assetPreviewUnavailable')}</span>}
      </div>
      {meta && (
        <code>
          {format('assetMetadata', {
            mediaType: meta.mediaType,
            width: meta.width ?? '—',
            height: meta.height ?? '—',
            bytes: '—',
          })}
        </code>
      )}
    </section>
  );
}

function AssetsView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  const [opacity, setOpacity] = useState(0.5);
  if (!change.asset) return <p className="empty-note">{text('notAssetChange')}</p>;
  return (
    <div className="change-metadata-view asset-change-view">
      <header className="change-subview-heading">
        <div>
          <span className="entity-kicker">{text('asset')}</span>
          <h3>{text('assetPreview')}</h3>
        </div>
        <code>{change.path}</code>
      </header>
      <div className="asset-preview-grid">
        <AssetPreview meta={change.asset.before} label={text('before')} locale={locale} />
        <AssetPreview meta={change.asset.after} label={text('after')} locale={locale} />
      </div>
      {change.asset.before && change.asset.after && (
        <section className="asset-overlay-panel">
          <label htmlFor="asset-overlay-opacity">{text('assetOverlay')}</label>
          <input
            id="asset-overlay-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => setOpacity(Number(event.currentTarget.value))}
          />
          <div className="asset-overlay-stage">
            <span
              className="asset-overlay-layer asset-overlay-before"
              style={{ aspectRatio: String(change.asset.before.aspectRatio ?? 1.6) }}
            />
            <span
              className="asset-overlay-layer asset-overlay-after"
              style={{ opacity, aspectRatio: String(change.asset.after.aspectRatio ?? 1.6) }}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function DiagnosticsView({ change, locale }: { change: Change; locale: Locale }) {
  const { text } = translator(locale);
  return change.diagnostics.length ? (
    <ul className="diagnostic-list">
      {change.diagnostics.map((item, index) => (
        <li key={`${item.code}:${index}`}>
          <code data-severity={item.severity}>{item.code}</code>
          <span>{item.message}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="empty-note">{text('noDiagnostics')}</p>
  );
}

function tabsFor(change: Change, locale: Locale): Array<{ id: TabId; label: string }> {
  const { text } = translator(locale);
  return [
    { id: 'source', label: text('changeSource') },
    ...(!change.binary ? [{ id: 'file' as const, label: text('changeFile') }] : []),
    ...(change.renderedDiffAvailable
      ? [{ id: 'rendered' as const, label: text('renderedDiff') }]
      : []),
    ...(change.semanticDiffAvailable || change.semanticChanges.length
      ? [{ id: 'semantic' as const, label: text('semanticDiff') }]
      : []),
    ...(change.classification === 'contract'
      ? [{ id: 'openapi' as const, label: text('openApiDiff') }]
      : []),
    ...(change.relationChanges.length
      ? [{ id: 'relations' as const, label: text('relations') }]
      : []),
    ...(change.screen || change.mermaidBlocks.length
      ? [{ id: 'map' as const, label: text('map') }]
      : []),
    ...(change.asset ? [{ id: 'assets' as const, label: text('assets') }] : []),
    { id: 'diagnostics', label: text('diagnostics') },
  ];
}

export function ChangesDetail({
  change,
  linkedPath,
  tab,
  onTab,
  locale,
  reviewEnabled,
  range,
}: {
  change?: Change | undefined;
  linkedPath?: string | undefined;
  tab: TabId;
  onTab: (tab: TabId) => void;
  locale: Locale;
  reviewEnabled: boolean;
  range: RangeState;
}) {
  const { text } = translator(locale);
  if (!change && linkedPath) return <FileView path={linkedPath} range={range} locale={locale} />;
  if (!change) return <p className="empty-note ui-empty-state">{text('noChangeSelected')}</p>;
  const tabs = tabsFor(change, locale);
  const discuss = (): void => {
    const selectedText = globalThis.getSelection?.()?.toString().trim();
    globalThis.document.dispatchEvent(
      new CustomEvent('toudocu:discussion-compose', {
        detail: {
          target: { kind: 'file', path: change.path, range: null },
          ...(selectedText ? { selection: { selectedText } } : {}),
        },
      }),
    );
  };
  const active = tabs.some((item) => item.id === tab) ? tab : (tabs[0]?.id ?? 'source');
  return (
    <article className="change-detail">
      <header className="change-detail-header">
        <div>
          <div className="change-file-identity">
            <h2>{change.path.split('/').pop()}</h2>
            <span className={`change-status status-${change.status}`}>
              {statusLabel(locale, change.status)}
            </span>
          </div>
          <p>
            <code>{change.oldPath ? `${change.oldPath} → ${change.path}` : change.path}</code> · +
            {change.lines.added} −{change.lines.deleted}
          </p>
        </div>
        <div className="workspace-actions">
          <a
            className="ui-icon-button"
            aria-label={text('edit')}
            title={text('edit')}
            href={`/_toudocu/editor/?path=${encodeURIComponent(change.path)}`}
          >
            <Icon name="edit" />
          </a>
          <button
            type="button"
            className="ui-icon-button"
            aria-label={text('discuss')}
            title={text('discuss')}
            disabled={!reviewEnabled}
            onClick={discuss}
          >
            <Icon name="messageSquare" />
          </button>
          {change.sourceDiff && (
            <button
              type="button"
              className="ui-icon-button"
              aria-label={text('copyPatch')}
              title={text('copyPatch')}
              onClick={() => copy(change.sourceDiff ?? '')}
            >
              <Icon name="clipboard" />
            </button>
          )}
        </div>
      </header>
      {change.diagnostics.length > 0 && (
        <details className="changes-diagnostics">
          <summary>
            {text('diagnostics')} · {change.diagnostics.length}
          </summary>
          <DiagnosticsView change={change} locale={locale} />
        </details>
      )}
      <nav className="change-view-tabs" role="tablist" aria-label={text('changeViews')}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {active === 'source' && (
        <SourceDiff change={change} locale={locale} reviewEnabled={reviewEnabled} />
      )}
      {active === 'file' && (
        <FileView path={change.path} oldPath={change.oldPath} range={range} locale={locale} />
      )}
      {active === 'rendered' && <RenderedView change={change} locale={locale} />}
      {active === 'semantic' && <SemanticView change={change} locale={locale} />}
      {active === 'openapi' && <OpenApiView change={change} locale={locale} />}
      {active === 'relations' && <RelationsView change={change} locale={locale} />}
      {active === 'map' && <DiagramView change={change} locale={locale} />}
      {active === 'assets' && <AssetsView change={change} locale={locale} />}
      {active === 'diagnostics' && <DiagnosticsView change={change} locale={locale} />}
    </article>
  );
}
