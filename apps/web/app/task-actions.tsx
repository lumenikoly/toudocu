import { useState } from 'react';
import {
  EditorFileResponseSchema,
  EditorSavedFileResponseSchema,
  EditorValidationResponseSchema,
  type PageViewV1,
  type PortalSnapshotV1,
} from '@toudocu/contracts';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { action, jsonRequest } from './workspace-api.js';

type TaskPage = Extract<PageViewV1, { kind: 'task' }>;
type WorkItem = TaskPage['workItem'];

export function TaskItemActions({
  item,
  snapshot,
  locale,
}: {
  item: WorkItem;
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text, format } = translator(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!snapshot.capabilities.taskActions || item.archived) return null;
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

  return (
    <div className="task-item-actions">
      {snapshot.capabilities.editing && item.workspace.canComplete && (
        <button type="button" disabled={busy} onClick={() => void complete()}>
          {text('completeTask')}
        </button>
      )}
      {snapshot.capabilities.agentConsole &&
        actions.map((entry) => (
          <button
            key={entry.label}
            type="button"
            disabled={busy}
            onClick={() => {
              document.dispatchEvent(
                new CustomEvent('toudocu:agent-compose', {
                  detail: {
                    text: format(entry.prompt, { id: item.id }),
                    policy: entry.readOnly ? 'filesystem-read-only' : 'normal',
                  },
                }),
              );
            }}
          >
            {text(entry.label)}
          </button>
        ))}
      {error && <p role="alert">{error}</p>}
    </div>
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
  const { text, status } = translator(locale);
  return (
    <section className="task-actions">
      <h2>{text('taskActions')}</h2>
      <p>{status(page.workItem.workspace.workState)}</p>
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
      <TaskItemActions item={page.workItem} snapshot={snapshot} locale={locale} />
    </section>
  );
}
