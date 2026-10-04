import { useEffect, useRef, useState } from 'react';
import {
  EditorFileResponseSchema,
  EditorSavedFileResponseSchema,
  EditorValidationResponseSchema,
  type PageViewV1,
  type PortalSnapshotV1,
} from '@toudocu/contracts';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { Icon } from './ui/index.js';
import type { IconName } from './design/icons.js';
import { action, jsonRequest } from './workspace-api.js';

type TaskPage = Extract<PageViewV1, { kind: 'task' }>;
type WorkItem = TaskPage['workItem'];
const actionIcons: Partial<Record<MessageKey, IconName>> = {
  taskCompleteTree: 'tree',
  startWork: 'play',
  taskContinue: 'play',
  taskExplainBlocker: 'shield',
  taskAsk: 'messageSquare',
  taskClarify: 'helpCircle',
  taskFixProblems: 'wrench',
  taskNext: 'arrowRight',
};

export function TaskItemActions({
  item,
  snapshot,
  locale,
  inline = false,
}: {
  item: WorkItem;
  snapshot: PortalSnapshotV1;
  locale: Locale;
  inline?: boolean;
}) {
  const { text, format } = translator(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<MessageKey>();
  const copyTimer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  if (item.archived) return null;
  const state = item.workspace.workState;
  if (state === 'cancelled') return null;
  const actions: { label: MessageKey; prompt: MessageKey; readOnly?: boolean }[] = [];
  if (item.childIds.length && ['ready', 'in-progress'].includes(state))
    actions.push({ label: 'taskCompleteTree', prompt: 'taskPromptTree' });
  if (state === 'ready') actions.push({ label: 'startWork', prompt: 'taskPromptStart' });
  if (state === 'in-progress')
    actions.push({ label: 'taskContinue', prompt: 'taskPromptContinue' });
  if (['blocked', 'waiting'].includes(state))
    actions.push({ label: 'taskExplainBlocker', prompt: 'taskPromptBlocker', readOnly: true });
  actions.push({ label: 'taskAsk', prompt: 'taskPromptAsk', readOnly: true });
  if (!['done', 'waiting'].includes(state))
    actions.push({ label: 'taskClarify', prompt: 'taskPromptClarify' });
  if (['draft', 'ready-candidate', 'needs-attention'].includes(state))
    actions.push({ label: 'taskFixProblems', prompt: 'taskPromptFix' });
  if (state === 'in-progress')
    actions.push({ label: 'taskNext', prompt: 'taskPromptNext', readOnly: true });

  const complete = async (): Promise<void> => {
    if (!window.confirm(format('completeTaskPrompt', { id: item.id }))) return;
    setBusy(true);
    setError('');
    try {
      const read = EditorFileResponseSchema.parse(
        await jsonRequest(`/_toudocu/api/editor/file?path=${encodeURIComponent(item.document)}`),
      );
      let changed = false;
      const content = read.file.content.replace(/<!--\s*toudocu\b[\s\S]*?-->/u, (metadata) =>
        metadata.replace(/^(status:[ \t]*)in-progress[ \t]*(?=\r?$)/mu, (_, prefix: string) => {
          changed = true;
          return `${prefix}done`;
        }),
      );
      if (!changed) throw new Error(text('taskStatusMissing'));
      const validation = EditorValidationResponseSchema.parse(
        await jsonRequest(
          '/_toudocu/api/editor/validate',
          action('POST', 'validate', { path: item.document, content }),
        ),
      );
      const issues = validation.diagnostics.filter((issue) => issue.severity === 'error');
      if (issues.length)
        throw new Error(
          `${text('taskCompletionBlocked')} ${issues.map((issue) => issue.message).join(' ')}`,
        );
      EditorSavedFileResponseSchema.parse(
        await jsonRequest(
          '/_toudocu/api/editor/file',
          action('PUT', 'save', {
            path: item.document,
            content,
            expectedDigest: read.file.digest,
            confirmOverwrite: false,
          }),
        ),
      );
      window.location.reload();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setBusy(false);
    }
  };

  const canComplete =
    snapshot.capabilities.taskActions &&
    snapshot.capabilities.editing &&
    item.workspace.canComplete;
  const copyPrompt = async (entry: (typeof actions)[number]): Promise<void> => {
    setError('');
    try {
      await navigator.clipboard.writeText(format(entry.prompt, { id: item.id }));
      setCopied(entry.label);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(undefined), 1600);
    } catch {
      setError(text('copyPromptFailed'));
    }
  };
  const commands = (
    <div className={inline ? 'task-prompt-actions' : 'task-item-actions-menu'}>
      {canComplete && (
        <button
          className="task-complete-action"
          type="button"
          disabled={busy}
          onClick={() => void complete()}
        >
          <Icon name="checkCircle" />
          {text('completeTask')}
        </button>
      )}
      {actions.map((entry) => (
        <div className="task-prompt-action" key={entry.label}>
          {snapshot.capabilities.agentConsole ? (
            <button
              className="task-prompt-send"
              type="button"
              disabled={busy}
              title={`${text('sendToAgent')}: ${text(entry.label)}`}
              onClick={(event) => {
                document.dispatchEvent(
                  new CustomEvent('toudocu:agent-compose', {
                    detail: {
                      text: format(entry.prompt, { id: item.id }),
                      policy: entry.readOnly ? 'filesystem-read-only' : 'normal',
                    },
                  }),
                );
                event.currentTarget.closest('.task-item-actions')?.removeAttribute('open');
              }}
            >
              <Icon name={actionIcons[entry.label] ?? 'messageSquare'} />
              <span>{text(entry.label)}</span>
            </button>
          ) : (
            <span className="task-prompt-label">
              <Icon name={actionIcons[entry.label] ?? 'messageSquare'} />
              {text(entry.label)}
            </span>
          )}
          <button
            className="task-prompt-copy"
            type="button"
            disabled={busy}
            aria-label={`${text('copyPrompt')}: ${text(entry.label)}`}
            title={
              copied === entry.label
                ? text('copied')
                : `${text('copyPrompt')}: ${text(entry.label)}`
            }
            data-copied={copied === entry.label || undefined}
            onClick={() => void copyPrompt(entry)}
          >
            <Icon name={copied === entry.label ? 'checkCircle' : 'clipboard'} />
          </button>
        </div>
      ))}
      {copied && (
        <span className="task-prompt-feedback" role="status">
          {text('copied')}
        </span>
      )}
      {error && (
        <p className="task-prompt-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
  return inline ? (
    commands
  ) : (
    <details
      className="task-item-actions"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return;
        event.preventDefault();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}
    >
      <summary aria-label={text('taskActions')} title={text('taskActions')}>
        <Icon name="more" />
      </summary>
      {commands}
    </details>
  );
}

export function TaskActions({
  page,
  snapshot,
  locale,
}: {
  page: TaskPage;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text } = translator(locale);
  return (
    <section className="task-actions">
      <h2>{text('taskActions')}</h2>
      {page.workItem.workspace.issues.length > 0 && (
        <details>
          <summary>
            {text('issues')} ({page.workItem.workspace.issues.length})
          </summary>
          <ul>
            {page.workItem.workspace.issues.map((issue, index) => (
              <li key={`${issue.code}:${index}`}>{issue.message}</li>
            ))}
          </ul>
        </details>
      )}
      <TaskItemActions item={page.workItem} snapshot={snapshot} locale={locale} inline />
    </section>
  );
}
