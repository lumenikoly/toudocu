import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ChangeSetReportV1Schema,
  EditorFileListSchema,
  EditorFileResponseSchema,
  EditorPreviewResponseSchema,
  EditorSavedFileResponseSchema,
  EditorValidationResponseSchema,
  ReviewStateSchema,
  type ChangeSetReportV1,
  type EditorFileList,
  type EditorFileResponse,
  type ReviewState,
} from '@toudocu/contracts';
import type { Locale } from './i18n.js';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function jsonRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, init);
  const value = (await response.json()) as { error?: { message?: string; details?: unknown } };
  if (!response.ok)
    throw new ApiError(
      value.error?.message ?? `HTTP ${response.status}`,
      response.status,
      value.error?.details,
    );
  return value;
}

function action(method: string, name: string, body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', 'x-toudocu-action': name },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  };
}

function useInitial<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then(setValue)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, []);
  return { value, setValue, error, setError };
}

export function EditorWorkspace({ locale }: { locale: Locale }) {
  const copy =
    locale === 'ru'
      ? {
          title: 'Редактор',
          preview: 'Предпросмотр',
          validate: 'Проверить',
          save: 'Сохранить',
          create: 'Создать',
          overwrite: 'Перезаписать свежую версию',
          conflict: 'Файл изменён другим процессом. Ваш текст сохранён в форме.',
        }
      : {
          title: 'Editor',
          preview: 'Preview',
          validate: 'Validate',
          save: 'Save',
          create: 'Create',
          overwrite: 'Overwrite current version',
          conflict: 'Another process changed the file. Your text remains in the form.',
        };
  const listState = useInitial((signal) =>
    jsonRequest('/_toudocu/api/editor/files', { signal }).then(EditorFileListSchema.parse),
  );
  const [current, setCurrent] = useState<EditorFileResponse>();
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState('');
  const [diagnostics, setDiagnostics] = useState<
    readonly { code: string; message: string; line: number }[]
  >([]);
  const [notice, setNotice] = useState('');
  const [conflictDigest, setConflictDigest] = useState('');
  const [templateKey, setTemplateKey] = useState('draft');
  const [language, setLanguage] = useState<'ru' | 'en'>(locale);
  const [fields, setFields] = useState<Record<string, string>>({});
  const files = listState.value?.files ?? [];
  const selectedTemplate = listState.value?.templates.find((item) => item.key === templateKey);

  const open = async (path: string): Promise<void> => {
    listState.setError('');
    try {
      const file = EditorFileResponseSchema.parse(
        await jsonRequest(`/_toudocu/api/editor/file?path=${encodeURIComponent(path)}`),
      );
      setCurrent(file);
      setContent(file.file.content);
      setDiagnostics(file.file.diagnostics);
      setPreview('');
      setConflictDigest('');
    } catch (error) {
      listState.setError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    const first = files[0]?.path;
    if (first && !current) void open(first);
  }, [files.length]);

  const submitContent = async (kind: 'preview' | 'validate'): Promise<void> => {
    if (!current) return;
    listState.setError('');
    try {
      const value = await jsonRequest(
        `/_toudocu/api/editor/${kind}`,
        action('POST', kind, { path: current.file.path, content }),
      );
      if (kind === 'preview') {
        const result = EditorPreviewResponseSchema.parse(value);
        setPreview(result.html);
        setDiagnostics(result.diagnostics);
      } else setDiagnostics(EditorValidationResponseSchema.parse(value).diagnostics);
    } catch (error) {
      listState.setError(error instanceof Error ? error.message : String(error));
    }
  };

  const save = async (confirmOverwrite = false): Promise<void> => {
    if (!current) return;
    listState.setError('');
    try {
      const result = EditorSavedFileResponseSchema.parse(
        await jsonRequest(
          '/_toudocu/api/editor/file',
          action('PUT', 'save', {
            path: current.file.path,
            content,
            expectedDigest: confirmOverwrite ? conflictDigest : current.file.digest,
            confirmOverwrite,
          }),
        ),
      );
      setCurrent(result);
      setContent(result.file.content);
      setDiagnostics(result.file.diagnostics);
      setConflictDigest('');
      setNotice(`${result.file.path} saved`);
      listState.setValue(
        await jsonRequest('/_toudocu/api/editor/files').then(EditorFileListSchema.parse),
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.details &&
        typeof error.details === 'object' &&
        'digest' in error.details
      ) {
        setConflictDigest(String(error.details.digest));
        setNotice(copy.conflict);
      } else listState.setError(error instanceof Error ? error.message : String(error));
    }
  };

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    listState.setError('');
    try {
      const result = EditorSavedFileResponseSchema.parse(
        await jsonRequest(
          '/_toudocu/api/editor/create',
          action('POST', 'create', { template: templateKey, language, fields }),
        ),
      );
      const next = await jsonRequest('/_toudocu/api/editor/files').then(EditorFileListSchema.parse);
      listState.setValue(next);
      setCurrent(result);
      setContent(result.file.content);
      setFields({});
    } catch (error) {
      listState.setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="workspace">
      <h1>{copy.title}</h1>
      {listState.error && <p role="alert">{listState.error}</p>}
      <div className="workspace-grid">
        <aside className="workspace-list">
          <ul>
            {files.map((file) => (
              <li key={file.path}>
                <button type="button" onClick={() => void open(file.path)}>
                  {file.title ?? file.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <section>
          {current ? (
            <>
              <h2>{current.file.path}</h2>
              <textarea
                className="editor-source"
                aria-label={current.file.path}
                value={content}
                onChange={(event) => setContent(event.currentTarget.value)}
              />
              <div className="workspace-actions">
                <button type="button" onClick={() => void submitContent('preview')}>
                  {copy.preview}
                </button>
                <button type="button" onClick={() => void submitContent('validate')}>
                  {copy.validate}
                </button>
                <button type="button" onClick={() => void save()}>
                  {copy.save}
                </button>
                {conflictDigest && (
                  <button type="button" onClick={() => void save(true)}>
                    {copy.overwrite}
                  </button>
                )}
              </div>
              {notice && <p role="status">{notice}</p>}
              {diagnostics.length > 0 && (
                <ul>
                  {diagnostics.map((item, index) => (
                    <li key={`${item.code}:${item.line}:${index}`}>
                      {item.code}: {item.message}
                    </li>
                  ))}
                </ul>
              )}
              {preview && (
                <div
                  className="document-body preview"
                  dangerouslySetInnerHTML={{ __html: preview }}
                />
              )}
            </>
          ) : (
            <p>Loading…</p>
          )}
        </section>
      </div>
      <form className="workspace-create" onSubmit={(event) => void create(event)}>
        <h2>{copy.create}</h2>
        <select
          aria-label="Template"
          value={templateKey}
          onChange={(event) => {
            setTemplateKey(event.currentTarget.value);
            setFields({});
          }}
        >
          {listState.value?.templates.map((template) => (
            <option key={template.key} value={template.key}>
              {template.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Language"
          value={language}
          onChange={(event) => setLanguage(event.currentTarget.value as 'ru' | 'en')}
        >
          <option value="ru">ru</option>
          <option value="en">en</option>
        </select>
        {selectedTemplate?.fields.map((field) =>
          field.type === 'select' ? (
            <select
              key={field.name}
              aria-label={field.label}
              required={field.required}
              value={fields[field.name] ?? ''}
              onChange={(event) =>
                setFields({ ...fields, [field.name]: event.currentTarget.value })
              }
            >
              <option value="" />
              {field.options?.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          ) : (
            <input
              key={field.name}
              aria-label={field.label}
              placeholder={field.label}
              required={field.required}
              value={fields[field.name] ?? ''}
              onChange={(event) =>
                setFields({ ...fields, [field.name]: event.currentTarget.value })
              }
            />
          ),
        )}
        <button type="submit">{copy.create}</button>
      </form>
    </div>
  );
}

export function ChangesWorkspace({ locale }: { locale: Locale }) {
  const [report, setReport] = useState<ChangeSetReportV1>();
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    base: 'HEAD',
    branchBase: '',
    target: 'working-tree',
    task: '',
    status: '',
    module: '',
    type: '',
  });
  const load = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault();
    setError('');
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
    if (filters.branchBase) query.delete('base');
    try {
      const next = ChangeSetReportV1Schema.parse(
        await jsonRequest(`/_toudocu/api/changes?${query}`),
      );
      setReport(next);
      setSelected((current) =>
        next.changes.some((item) => item.path === current)
          ? current
          : (next.changes[0]?.path ?? ''),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const change = report?.changes.find((item) => item.path === selected);
  return (
    <div className="workspace">
      <h1>{locale === 'ru' ? 'Изменения' : 'Changes'}</h1>
      <form className="workspace-filters" onSubmit={(event) => void load(event)}>
        {Object.entries(filters).map(([key, value]) => (
          <input
            key={key}
            aria-label={key}
            placeholder={key}
            value={value}
            onChange={(event) => setFilters({ ...filters, [key]: event.currentTarget.value })}
          />
        ))}
        <button type="submit">{locale === 'ru' ? 'Обновить' : 'Refresh'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {report && (
        <p>
          {report.summary.files.added} added, {report.summary.files.modified} modified,{' '}
          {report.summary.files.deleted} deleted, {report.summary.files.renamed} renamed,{' '}
          {report.summary.files.copied} copied, {report.summary.files.typeChanged} type changed,{' '}
          {report.summary.files.untracked} untracked
        </p>
      )}
      <div className="workspace-grid">
        <aside className="workspace-list">
          <ul>
            {report?.changes.map((item) => (
              <li key={item.path}>
                <button type="button" onClick={() => setSelected(item.path)}>
                  {item.status}: {item.path}
                </button>
              </li>
            ))}
          </ul>
        </aside>
        {change && (
          <article className="change-detail">
            <h2>{change.path}</h2>
            <p>
              {change.classification}; +{change.lines.added} −{change.lines.deleted}
            </p>
            {change.sourceDiff && (
              <>
                <h3>Source diff</h3>
                <pre>{change.sourceDiff}</pre>
              </>
            )}
            {change.semanticChanges.length > 0 && (
              <>
                <h3>Semantic diff</h3>
                <ul>
                  {change.semanticChanges.map((item, index) => (
                    <li key={`${item.kind}:${index}`}>{item.summary}</li>
                  ))}
                </ul>
              </>
            )}
            {(change.renderedSections.length > 0 ||
              change.renderedBefore !== undefined ||
              change.renderedAfter !== undefined) && (
              <>
                <h3>Rendered diff</h3>
                {change.renderedSections.length > 0 && (
                  <ul>
                    {change.renderedSections.map((item) => (
                      <li key={item.id}>
                        {item.status}: {item.titleAfter ?? item.titleBefore ?? item.id}
                      </li>
                    ))}
                  </ul>
                )}
                {(change.renderedBefore !== undefined || change.renderedAfter !== undefined) && (
                  <div className="rendered-diff">
                    <section>
                      <h4>Before</h4>
                      <div dangerouslySetInnerHTML={{ __html: change.renderedBefore ?? '' }} />
                    </section>
                    <section>
                      <h4>After</h4>
                      <div dangerouslySetInnerHTML={{ __html: change.renderedAfter ?? '' }} />
                    </section>
                  </div>
                )}
              </>
            )}
            {change.relationChanges.length > 0 && (
              <>
                <h3>Relations</h3>
                <ul>
                  {change.relationChanges.map((item, index) => (
                    <li key={`${item.kind}:${index}`}>
                      {item.kind}: {item.source.id ?? item.source.title} →{' '}
                      {item.target.id ?? item.target.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </article>
        )}
      </div>
      {report?.taskImpact && (
        <section>
          <h2>Task {report.taskImpact.taskId}</h2>
          <p>
            {report.taskImpact.actual.length} actual paths; {report.taskImpact.declared.length}{' '}
            declared paths.
          </p>
        </section>
      )}
    </div>
  );
}

export function DiscussionsWorkspace({ locale }: { locale: Locale }) {
  const state = useInitial((signal) =>
    jsonRequest('/_toudocu/api/agent/discussions', { signal }).then(ReviewStateSchema.parse),
  );
  const [path, setPath] = useState('docs/index.md');
  const [text, setText] = useState('');
  const discussions = state.value?.session?.discussions ?? [];
  const guard = useMemo(
    () => ({
      expectedRevision: state.value?.revision ?? 0,
      expectedStateDigest: state.value?.stateDigest ?? '',
    }),
    [state.value],
  );
  const mutate = async (
    url: string,
    method: string,
    name: string,
    body: unknown,
  ): Promise<void> => {
    state.setError('');
    try {
      state.setValue(ReviewStateSchema.parse(await jsonRequest(url, action(method, name, body))));
    } catch (error) {
      state.setError(error instanceof Error ? error.message : String(error));
    }
  };
  const create = (event: FormEvent): void => {
    event.preventDefault();
    void mutate('/_toudocu/api/agent/discussions', 'POST', 'agent-discussion-create', {
      ...guard,
      target: { kind: 'document', path },
      intent: 'question',
      text,
    }).then(() => setText(''));
  };
  return (
    <div className="workspace">
      <h1>{locale === 'ru' ? 'Обсуждения' : 'Discussions'}</h1>
      {state.error && <p role="alert">{state.error}</p>}
      <form className="workspace-create" onSubmit={create}>
        <input
          aria-label="Path"
          value={path}
          onChange={(event) => setPath(event.currentTarget.value)}
          required
        />
        <textarea
          aria-label="Message"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
          required
        />
        <button type="submit">{locale === 'ru' ? 'Отправить агенту' : 'Send to agent'}</button>
      </form>
      {discussions.map((discussion) => (
        <Discussion
          key={discussion.id}
          discussion={discussion}
          state={state.value!}
          mutate={mutate}
          locale={locale}
        />
      ))}
    </div>
  );
}

function Discussion({
  discussion,
  state,
  mutate,
  locale,
}: {
  discussion: NonNullable<ReviewState['session']>['discussions'][number];
  state: ReviewState;
  mutate: (url: string, method: string, name: string, body: unknown) => Promise<void>;
  locale: Locale;
}) {
  const [text, setText] = useState('');
  const guard = { expectedRevision: state.revision, expectedStateDigest: state.stateDigest };
  return (
    <article className="discussion">
      <h2>{discussion.target.path}</h2>
      <p>
        {discussion.state}; {discussion.placement.status}
      </p>
      {discussion.messages.map((message) => (
        <div key={message.id}>
          <strong>{message.author}</strong>
          <p>{message.text}</p>
        </div>
      ))}
      <div className="workspace-actions">
        <button
          type="button"
          onClick={() =>
            void mutate(
              `/_toudocu/api/agent/discussions/${discussion.id}`,
              'PATCH',
              'agent-discussion-update',
              { ...guard, state: discussion.state === 'open' ? 'resolved' : 'open' },
            )
          }
        >
          {discussion.state === 'open'
            ? locale === 'ru'
              ? 'Закрыть'
              : 'Resolve'
            : locale === 'ru'
              ? 'Открыть'
              : 'Reopen'}
        </button>
      </div>
      {discussion.state === 'open' && (
        <form
          className="workspace-create"
          onSubmit={(event) => {
            event.preventDefault();
            void mutate(
              `/_toudocu/api/agent/discussions/${discussion.id}/messages`,
              'POST',
              'agent-message-create',
              { ...guard, intent: 'question', text },
            ).then(() => setText(''));
          }}
        >
          <textarea
            aria-label="Reply"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
            required
          />
          <button type="submit">{locale === 'ru' ? 'Ответить' : 'Reply'}</button>
        </form>
      )}
    </article>
  );
}
