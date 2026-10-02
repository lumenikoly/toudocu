import { useState } from 'react';
import type { AgentSessionState } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { stripControlSequences } from './agent-console-output.js';

export function AgentVerification({
  state,
  locale,
  available,
  disabled,
  post,
  onError,
}: {
  state: AgentSessionState | undefined;
  locale: Locale;
  available: boolean;
  disabled: boolean;
  post(path: string, name: string, body: unknown): Promise<void>;
  onError(reason: unknown): void;
}) {
  const { text, status } = translator(locale);
  const [busy, setBusy] = useState(false);
  const report = state?.verification;
  const taskID = state?.settings?.launch.taskID;
  if ((!available || !taskID) && !report) return null;
  const mutable = !disabled && !busy && !state?.verificationRunning;
  const current = Boolean(state?.active && taskID && report?.task.id === taskID);
  const runnable =
    current &&
    report?.mode === 'dry-run' &&
    report.status === 'planned' &&
    report.commands.length > 0;
  const execute = async (operation: 'plan' | 'run' | 'send'): Promise<void> => {
    if (
      operation === 'run' &&
      (!runnable ||
        !window.confirm(
          text('consoleVerificationConfirm')
            .replace('{root}', state?.settings?.launch.cwd ?? '')
            .replace('{commands}', report.commands.map((command) => command.command).join('\n')),
        ))
    )
      return;
    setBusy(true);
    try {
      const path = operation === 'run' ? 'verify' : `verification/${operation}`;
      const name = operation === 'run' ? 'agent-task-verify' : `agent-verification-${operation}`;
      await post(
        `/_toudocu/api/agent-console/${path}`,
        name,
        operation === 'send' ? {} : { taskID, ...(operation === 'run' ? { confirmed: true } : {}) },
      );
    } catch (reason) {
      onError(reason);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="agent-verification-output" aria-label={text('verification')}>
      <h3>
        {text('verification')}
        {taskID ? ` · ${taskID}` : ''}
      </h3>
      {available && state?.active && taskID && (
        <div className="workspace-actions">
          <button
            type="button"
            className="ui-button"
            disabled={!mutable}
            onClick={() => void execute('plan')}
          >
            {text('consoleVerificationPlan')}
          </button>
          <button
            type="button"
            className="ui-button"
            disabled={!mutable || !runnable}
            onClick={() => void execute('run')}
          >
            {text('consoleVerificationRun')}
          </button>
        </div>
      )}
      {(busy || state?.verificationRunning) && (
        <p role="status">{text('consoleVerificationWorking')}</p>
      )}
      {report && (
        <details open>
          <summary>
            {report.task.id} · {status(report.status)}
          </summary>
          {report.validationIssues.map((issue, index) => (
            <p role="alert" key={`${issue.code}:${index}`}>
              {issue.message}
            </p>
          ))}
          {report.mode === 'run' && (
            <p>
              {text('consoleVerificationPassed')}: {report.summary.passedCommands} ·{' '}
              {text('consoleVerificationFailed')}: {report.summary.failedCommands}
            </p>
          )}
          {report.commands.map((command) => (
            <details
              key={command.sequence}
              open={command.status !== 'passed' && command.status !== 'planned'}
            >
              <summary>
                <code>{command.command}</code> · {status(command.status)}
              </summary>
              <p>
                {command.targets.join(', ')}
                {command.exitCode !== null
                  ? ` · ${text('consoleExitCode')}: ${command.exitCode}`
                  : ''}
              </p>
              {(command.stdout || command.stderr) && (
                <pre className="command-output">
                  {stripControlSequences(command.stdout + command.stderr)}
                </pre>
              )}
              {(command.stdoutTruncated || command.stderrTruncated) && (
                <p>{text('consoleTruncated')}</p>
              )}
            </details>
          ))}
          {report.criteria.length > 0 && (
            <ul>
              {report.criteria.map((criterion) => (
                <li key={criterion.id}>
                  {criterion.id}: {criterion.description} · {status(criterion.status)}
                </li>
              ))}
            </ul>
          )}
          {report.status === 'failed' && (
            <button
              type="button"
              className="ui-button"
              disabled={
                !mutable || !current || state?.status === 'failed' || state?.status === 'stopping'
              }
              onClick={() => void execute('send')}
            >
              {text('consoleVerificationSend')}
            </button>
          )}
        </details>
      )}
    </section>
  );
}
