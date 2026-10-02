import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ReviewStateSchema, type ReviewState } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { Icon, IconButton } from './ui/index.js';

type Discussion = NonNullable<ReviewState['session']>['discussions'][number];
type Message = Discussion['messages'][number];
type Position = { line: number; column: number };
type ReviewTarget = {
  kind: string;
  path: string;
  documentId?: string;
  range?: { start: Position; end: Position } | null;
};
type Selection = { selectedText: string; occurrence?: number };
type ComposeDetail = {
  target?: ReviewTarget;
  selection?: Selection;
  quote?: string;
};
type Filter = 'all' | 'open' | 'resolved';
type ComposerMode = ComposeDetail & { discussionId?: string; message?: Message };

async function request(path: string, init?: RequestInit): Promise<ReviewState> {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error?: { message?: string } }).error?.message ?? response.status)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return ReviewStateSchema.parse(body);
}

function action(method: string, name: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json', 'x-toudocu-action': name },
    body: JSON.stringify(body),
  };
}

function guard(state: ReviewState | undefined) {
  return {
    expectedRevision: state?.revision ?? 0,
    expectedStateDigest: state?.stateDigest ?? '',
  };
}

function placementLabel(status: string, locale: Locale): string {
  const { text } = translator(locale);
  return (
    {
      current: text('current'),
      moved: text('moved'),
      stale: text('stalePlacement'),
      deleted: text('deletedPlacement'),
    }[status] ?? status
  );
}

function deliveryLabel(state: string, locale: Locale): string {
  const { text } = translator(locale);
  return (
    {
      pending: text('pending'),
      claimed: text('claimed'),
      responded: text('responded'),
    }[state] ?? state
  );
}

function MessageView({
  message,
  locale,
  editable,
  busy,
  onEdit,
  onDelete,
}: {
  message: Message;
  locale: Locale;
  editable: boolean;
  busy: boolean;
  onEdit(): void;
  onDelete(): void;
}) {
  const { text } = translator(locale);
  const outcomes: Record<string, string> = {
    answered: text('discussionAnswered'),
    changed: text('discussionChanged'),
    no_change: text('discussionNoChange'),
    needs_clarification: text('discussionNeedsClarification'),
    failed: text('discussionFailed'),
  };
  return (
    <li className={`discussion-message is-${message.author}`}>
      <header>
        <strong>
          {message.author === 'human' ? text('discussionHuman') : text('discussionAgent')}
        </strong>
        <time dateTime={message.createdAt}>
          {new Date(message.createdAt).toLocaleString(locale)}
        </time>
      </header>
      <p>{message.text}</p>
      {message.editedAt && <p className="discussion-meta">{text('discussionEdited')}</p>}
      {editable && (
        <div className="discussion-message-actions">
          <IconButton
            disabled={busy}
            onClick={onEdit}
            aria-label={text('edit')}
            title={text('edit')}
          >
            <Icon name="edit" />
          </IconButton>
          <IconButton
            disabled={busy}
            onClick={onDelete}
            aria-label={text('deleteMessage')}
            title={text('deleteMessage')}
          >
            <Icon name="trash" />
          </IconButton>
        </div>
      )}
      {message.outcome && (
        <p className="discussion-meta">
          {text('outcome')}: {outcomes[message.outcome] ?? message.outcome}
        </p>
      )}
      {message.evidence.length > 0 && (
        <details className="discussion-evidence">
          <summary>{text('evidence')}</summary>
          <ul>
            {message.evidence.map((item) => (
              <li key={`${item.path}:${item.startLine ?? 0}`}>
                <code>{item.path}</code>
                {item.startLine !== undefined && `:${item.startLine}`}
                {item.endLine !== undefined && `–${item.endLine}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {message.changedPaths.length > 0 && (
        <details className="discussion-evidence">
          <summary>{text('changedPaths')}</summary>
          <ul>
            {message.changedPaths.map((path) => (
              <li key={path}>
                <code>{path}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function DiscussionCard({
  discussion,
  state,
  locale,
  onResolve,
  onReply,
  onDelete,
  onEditMessage,
  onDeleteMessage,
  busy,
}: {
  discussion: Discussion;
  state: ReviewState;
  locale: Locale;
  onResolve(): void;
  onReply(): void;
  onDelete(): void;
  onEditMessage(message: Message): void;
  onDeleteMessage(message: Message): void;
  busy: boolean;
}) {
  const { text } = translator(locale);
  const deliveries = state.deliveries.filter((item) => item.discussionId === discussion.id);
  const pending = deliveries.some((item) => item.state !== 'responded');
  const delivery = deliveries.find((item) => item.state !== 'responded') ?? deliveries.at(-1);
  const target = discussion.placement.path || discussion.target.path;
  return (
    <article className={`discussion-thread is-${discussion.state}`}>
      <header className="discussion-thread-header">
        <div>
          <code>{discussion.id}</code>
          <h2>{target}</h2>
          <p className="discussion-meta">
            {discussion.state === 'open' ? text('openDiscussions') : text('resolvedDiscussions')}
            {' · '}
            {text('placement')}: {placementLabel(discussion.placement.status, locale)}
            {delivery && ` · ${text('delivery')}: ${deliveryLabel(delivery.state, locale)}`}
          </p>
        </div>
        <div className="discussion-thread-actions">
          <IconButton
            disabled={busy}
            onClick={onResolve}
            aria-label={discussion.state === 'open' ? text('resolve') : text('reopen')}
            title={discussion.state === 'open' ? text('resolve') : text('reopen')}
          >
            <Icon name={discussion.state === 'open' ? 'checkCircle' : 'history'} />
          </IconButton>
          <IconButton
            disabled={busy}
            onClick={onDelete}
            aria-label={text('deleteDiscussion')}
            title={text('deleteDiscussion')}
          >
            <Icon name="trash" />
          </IconButton>
        </div>
      </header>
      {discussion.anchor?.selectedText && (
        <blockquote className="discussion-quote">
          <span>{text('selection')}</span>
          {discussion.anchor.selectedText}
        </blockquote>
      )}
      {discussion.placement.range && (
        <p className="discussion-meta">
          {text('path')}: <code>{target}</code> · {discussion.placement.range.start.line}:
          {discussion.placement.range.start.column}–{discussion.placement.range.end.line}:
          {discussion.placement.range.end.column}
        </p>
      )}
      <ol className="discussion-messages">
        {discussion.messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            locale={locale}
            busy={busy}
            editable={
              message.author === 'human' &&
              ((message.state === 'draft' && !message.deliveryId) ||
                deliveries.some(
                  (item) => item.id === message.deliveryId && item.state === 'pending',
                ))
            }
            onEdit={() => onEditMessage(message)}
            onDelete={() => onDeleteMessage(message)}
          />
        ))}
      </ol>
      {discussion.state === 'open' && (
        <button
          type="button"
          disabled={busy || pending}
          className="discussion-reply"
          onClick={onReply}
        >
          {text('reply')}
        </button>
      )}
    </article>
  );
}

function Composer({
  mode,
  locale,
  onClose,
  onSubmit,
}: {
  mode: ComposerMode | null;
  locale: Locale;
  onClose(): void;
  onSubmit(value: string, intent: 'question' | 'change_request'): Promise<void>;
}) {
  const { text } = translator(locale);
  const [value, setValue] = useState('');
  const [intent, setIntent] = useState<'question' | 'change_request'>('question');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setValue(mode?.message?.text ?? mode?.quote ?? '');
    setIntent(
      ['change', 'change_request'].includes(mode?.message?.intent ?? '')
        ? 'change_request'
        : 'question',
    );
  }, [mode]);
  if (!mode) return null;
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    try {
      await onSubmit(value.trim(), intent);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="discussion-composer" aria-label={text('newDiscussion')}>
      <form onSubmit={(event) => void submit(event)}>
        <header>
          <h2>
            {mode.message
              ? text('editMessage')
              : mode.discussionId
                ? text('reply')
                : text('newDiscussion')}
          </h2>
          {mode.target && <code>{mode.target.path}</code>}
        </header>
        {mode.selection && (
          <blockquote className="discussion-quote">
            <span>{text('selection')}</span>
            {mode.selection.selectedText}
          </blockquote>
        )}
        <label>
          {text('type')}
          <select
            value={intent}
            onChange={(event) => setIntent(event.currentTarget.value as typeof intent)}
          >
            <option value="question">{text('question')}</option>
            <option value="change_request">{text('changeRequest')}</option>
          </select>
        </label>
        <label>
          {text('message')}
          <textarea
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            required
            autoFocus
          />
        </label>
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {text('close')}
          </button>
          <button type="submit" disabled={busy}>
            {busy ? text('pending') : mode.message ? text('save') : text('send')}
          </button>
        </footer>
      </form>
    </section>
  );
}

export function DiscussionsWorkspace({ locale }: { locale: Locale }) {
  return <DiscussionPanel locale={locale} fullPage />;
}

export function DiscussionPanel({
  locale,
  fullPage = false,
}: {
  locale: Locale;
  fullPage?: boolean;
}) {
  const { text } = translator(locale);
  const [state, setState] = useState<ReviewState>();
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [panelOpen, setPanelOpen] = useState(fullPage);
  const [target, setTarget] = useState<ReviewTarget>();
  const [composer, setComposer] = useState<ComposerMode | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (): Promise<void> => {
    try {
      setState(await request('/_toudocu/api/agent/discussions'));
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!panelOpen) return;
    const timer = window.setInterval(() => {
      if (!document.hidden && !composer && !busy) void load();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [busy, composer, load, panelOpen]);
  useEffect(() => {
    if (fullPage) return;
    const compose = (event: Event): void => {
      const detail = (event as CustomEvent<ComposeDetail>).detail;
      setTarget(detail.target);
      setPanelOpen(true);
      setComposer(detail);
    };
    const open = (): void => {
      setTarget(undefined);
      setPanelOpen(true);
    };
    const close = (): void => setPanelOpen(false);
    document.addEventListener('toudocu:discussion-compose', compose);
    document.addEventListener('toudocu:discussions-open', open);
    document.addEventListener('toudocu:discussions-close', close);
    return () => {
      document.removeEventListener('toudocu:discussion-compose', compose);
      document.removeEventListener('toudocu:discussions-open', open);
      document.removeEventListener('toudocu:discussions-close', close);
    };
  }, [fullPage]);
  const allDiscussions = (state?.session?.discussions ?? []).filter(
    (discussion) =>
      !target ||
      discussion.target.path === target.path ||
      discussion.placement.path === target.path,
  );
  const discussions = useMemo(() => {
    const values = state?.session?.discussions ?? [];
    return values
      .filter(
        (discussion) =>
          !target ||
          discussion.target.path === target.path ||
          discussion.placement.path === target.path,
      )
      .filter((discussion) => filter === 'all' || discussion.state === filter)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [filter, state, target]);
  const openCount = allDiscussions.filter((discussion) => discussion.state === 'open').length;
  const mutate = async (
    path: string,
    method: string,
    name: string,
    body: unknown,
  ): Promise<boolean> => {
    setBusy(true);
    try {
      const values = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
      setState(await request(path, action(method, name, { ...guard(state), ...values })));
      setError('');
      return true;
    } catch (reason) {
      await load();
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const submit = async (value: string, intent: 'question' | 'change_request'): Promise<void> => {
    if (!composer) return;
    let saved: boolean;
    if (composer.discussionId) {
      saved = await mutate(
        `/_toudocu/api/agent/discussions/${composer.discussionId}/messages${composer.message ? `/${composer.message.id}` : ''}`,
        composer.message ? 'PATCH' : 'POST',
        composer.message ? 'agent-message-update' : 'agent-message-create',
        {
          intent,
          text: value,
        },
      );
    } else {
      saved = await mutate('/_toudocu/api/agent/discussions', 'POST', 'agent-discussion-create', {
        target: composer.target ?? target ?? { kind: 'document', path: 'index.md' },
        selection: composer.selection,
        intent,
        text: value,
      });
    }
    if (saved) setComposer(null);
  };
  const content = (
    <>
      <header className="workspace-heading">
        <div>
          <h1>{text('discussions')}</h1>
          {target && <code className="discussion-target-path">{target.path}</code>}
        </div>
        <div className="discussion-thread-actions">
          <IconButton
            onClick={() => setComposer(target ? { target } : {})}
            aria-label={text('newDiscussion')}
            title={text('newDiscussion')}
          >
            <Icon name="plus" />
          </IconButton>
          {!fullPage && (
            <IconButton
              onClick={() => {
                setPanelOpen(false);
                document.getElementById('main-content')?.focus();
              }}
              aria-label={text('close')}
              title={text('close')}
            >
              <Icon name="close" />
            </IconButton>
          )}
        </div>
      </header>
      <div className="discussion-summary">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          {text('allDiscussions')} · {allDiscussions.length}
        </button>
        <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>
          {text('openDiscussions')} · {openCount}
        </button>
        <button
          type="button"
          aria-pressed={filter === 'resolved'}
          onClick={() => setFilter('resolved')}
        >
          {text('resolvedDiscussions')} · {allDiscussions.length - openCount}
        </button>
      </div>
      {error && (
        <div className="discussion-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            {text('retry')}
          </button>
        </div>
      )}
      {!error && discussions.length === 0 && <p className="empty-note">{text('noDiscussions')}</p>}
      <Composer
        mode={composer}
        locale={locale}
        onClose={() => setComposer(null)}
        onSubmit={submit}
      />
      <div className="discussion-list">
        {discussions.map((discussion) => (
          <DiscussionCard
            key={discussion.id}
            discussion={discussion}
            state={state!}
            locale={locale}
            busy={busy}
            onDelete={() => {
              if (window.confirm(text('confirmDeleteDiscussion'))) {
                void mutate(
                  `/_toudocu/api/agent/discussions/${discussion.id}`,
                  'DELETE',
                  'agent-discussion-delete',
                  {},
                );
              }
            }}
            onEditMessage={(message) => setComposer({ discussionId: discussion.id, message })}
            onDeleteMessage={(message) => {
              if (window.confirm(text('confirmDeleteMessage'))) {
                void mutate(
                  `/_toudocu/api/agent/discussions/${discussion.id}/messages/${message.id}`,
                  'DELETE',
                  'agent-message-delete',
                  {},
                );
              }
            }}
            onResolve={() =>
              void mutate(
                `/_toudocu/api/agent/discussions/${discussion.id}`,
                'PATCH',
                'agent-discussion-update',
                {
                  state: discussion.state === 'open' ? 'resolved' : 'open',
                },
              )
            }
            onReply={() => setComposer({ discussionId: discussion.id })}
          />
        ))}
      </div>
    </>
  );
  return fullPage ? (
    <div className="workspace discussions-workspace">{content}</div>
  ) : (
    <aside
      className={`discussion-panel${panelOpen ? ' is-open' : ''}`}
      aria-label={text('feedback')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setPanelOpen(false);
          document.getElementById('main-content')?.focus();
        }
      }}
    >
      {content}
    </aside>
  );
}
