import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AgentConsoleMessageSchema,
  AgentConsoleStateSchema,
  AgentThreadSchema,
  type AgentConsoleMessage,
  type AgentConsoleState,
  type AgentThread,
} from '@toudocu/contracts';
import type { Locale } from './i18n.js';

const PANEL_STORAGE = 'toudocu.agent-console.panel';
const TAB_STORAGE = 'toudocu.agent-console.tab';

function action(name: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-toudocu-action': name },
    body: JSON.stringify(body),
  };
}

export function AgentConsoleWorkspace({ locale }: { locale: Locale }) {
  const [consoleState, setConsoleState] = useState<AgentConsoleState>();
  const [events, setEvents] = useState<AgentConsoleMessage[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'agent' | 'output'>('agent');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [provider, setProvider] = useState('');
  const [preset, setPreset] = useState<'default' | 'full-access'>('default');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const latestState = useRef<AgentConsoleState['state'] | undefined>(undefined);
  const [socket, setSocket] = useState<WebSocket | undefined>(undefined);
  const lastSequence = useRef(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(sessionStorage.getItem(PANEL_STORAGE) === 'open');
    if (sessionStorage.getItem(TAB_STORAGE) === 'output') setTab('output');
  }, []);

  useEffect(() => {
    sessionStorage.setItem(PANEL_STORAGE, open ? 'open' : 'closed');
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const mobile = matchMedia('(max-width: 52rem)').matches;
      if (mobile && typeof dialog.showModal === 'function') dialog.showModal();
      else if (typeof dialog.show === 'function') dialog.show();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    sessionStorage.setItem(TAB_STORAGE, tab);
  }, [tab]);

  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const applySetup = (value: AgentConsoleState): void => {
      setConsoleState((current) => ({
        ...value,
        state: current?.state ?? latestState.current ?? value.state,
      }));
      setProvider(value.setup.selectedProvider);
      setPreset(value.setup.preference.launchPreset);
      setModel(value.setup.preference.model ?? '');
      setEffort(value.setup.preference.effort ?? '');
    };

    void fetch('/_toudocu/api/agent-console/')
      .then(assertResponse)
      .then(AgentConsoleStateSchema.parse)
      .then((value) => active && applySetup(value))
      .catch((reason: unknown) => active && setError(String(reason)));

    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = new URL(`${protocol}//${location.host}/_toudocu/api/agent-console/ws`);
      url.searchParams.set('since', String(lastSequence.current));
      const connection = new WebSocket(url);
      socketRef.current = connection;
      connection.onopen = () => {
        if (!active) return;
        setConnected(true);
        setError('');
        setSocket(connection);
      };
      connection.onmessage = ({ data }) => {
        const value = AgentConsoleMessageSchema.parse(JSON.parse(String(data)));
        lastSequence.current = Math.max(lastSequence.current, value.sequence);
        if (value.kind === 'state' && value.state) {
          latestState.current = value.state;
          setConsoleState((current) => (current ? { ...current, state: value.state! } : current));
        } else if (value.kind === 'replay_gap') {
          setEvents([]);
          setError(
            locale === 'ru'
              ? 'История была сокращена; показано актуальное состояние.'
              : 'Earlier history expired; current state is shown.',
          );
        } else {
          setEvents((current) => [...current.slice(-199), value]);
        }
      };
      connection.onclose = () => {
        if (!active) return;
        setConnected(false);
        setSocket(undefined);
        retry = setTimeout(connect, 500);
      };
      connection.onerror = () => connection.close();
    };
    connect();

    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      socketRef.current?.close();
      socketRef.current = undefined;
      setSocket(undefined);
    };
  }, [locale]);

  const post = async (path: string, name: string, body: unknown): Promise<void> => {
    if (!connected) throw new Error('Agent Console is disconnected');
    setError('');
    const response = await fetch(path, action(name, body));
    const state = AgentConsoleStateSchema.shape.state.parse(await assertResponse(response));
    latestState.current = state;
    setConsoleState((current) => (current ? { ...current, state } : current));
  };

  const sendSocket = (value: unknown): void => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError(locale === 'ru' ? 'Соединение потеряно' : 'Connection lost');
      return;
    }
    socketRef.current.send(JSON.stringify(value));
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!message.trim()) return;
    sendSocket({ action: 'message', text: message });
    setMessage('');
  };

  const loadHistory = async (): Promise<void> => {
    const response = await fetch(
      `/_toudocu/api/agent-console/history?provider=${encodeURIComponent(provider)}`,
    );
    const body = (await assertResponse(response)) as { threads?: unknown };
    setThreads(AgentThreadSchema.array().parse(body.threads));
  };

  const commands = useMemo(() => commandEvents(events), [events]);
  const selected = commands.find((command) => command.id === selectedCommand) ?? commands.at(-1);
  const copy = locale === 'ru' ? 'Агент и терминал' : 'Agent and terminal';
  const state = consoleState?.state;
  const setup = consoleState?.setup;

  const stopAgent = async (): Promise<void> => {
    try {
      await post('/_toudocu/api/agent-console/stop', 'agent-session-stop', {
        discardPending: false,
      });
    } catch (reason) {
      if (!state?.pending?.length) throw reason;
      const confirmed = window.confirm(
        locale === 'ru'
          ? 'Удалить ожидающие сообщения и остановить агента?'
          : 'Discard pending messages and stop the agent?',
      );
      if (!confirmed) return;
      await post('/_toudocu/api/agent-console/stop', 'agent-session-stop', {
        discardPending: true,
      });
    }
  };

  return (
    <section className="agent-console" aria-label={copy}>
      <button
        ref={toggleRef}
        type="button"
        className="agent-console-toggle ui-button"
        aria-expanded={open}
        aria-controls="agent-console-panel"
        onClick={() => setOpen(true)}
      >
        {copy}
        {state?.active ? ' •' : ''}
      </button>
      <dialog
        ref={dialogRef}
        id="agent-console-panel"
        className="agent-console-panel"
        aria-label={copy}
        onClose={() => {
          setOpen(false);
          toggleRef.current?.focus();
        }}
      >
        <header className="agent-console-header">
          <strong>{copy}</strong>
          <span className="ui-badge">{connected ? 'online' : 'offline'}</span>
          <button
            type="button"
            className="ui-button"
            onClick={() => {
              setOpen(false);
              toggleRef.current?.focus();
            }}
          >
            {locale === 'ru' ? 'Закрыть' : 'Close'}
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        {!state?.active && setup && (
          <div className="agent-settings">
            <label>
              Provider
              <select value={provider} onChange={(event) => setProvider(event.currentTarget.value)}>
                {setup.availableProviders.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label>
              {locale === 'ru' ? 'Доступ' : 'Access'}
              <select
                value={preset}
                onChange={(event) =>
                  setPreset(event.currentTarget.value as 'default' | 'full-access')
                }
              >
                <option value="default">Default</option>
                <option value="full-access">Full access</option>
              </select>
            </label>
            <label>
              Model
              <input
                list="agent-models"
                value={model}
                onChange={(event) => setModel(event.currentTarget.value)}
              />
              <datalist id="agent-models">
                {setup.models?.map((entry) => (
                  <option key={entry.id} value={entry.id} />
                ))}
              </datalist>
            </label>
            <label>
              Reasoning
              <input value={effort} onChange={(event) => setEffort(event.currentTarget.value)} />
            </label>
            <button
              type="button"
              className="ui-button"
              disabled={!connected}
              onClick={() => {
                const confirmed =
                  preset !== 'full-access' ||
                  window.confirm(
                    locale === 'ru'
                      ? 'Разрешить агенту полный доступ к этому репозиторию?'
                      : 'Allow the agent full access to this repository?',
                  );
                if (!confirmed) return;
                void post('/_toudocu/api/agent-console/preference', 'agent-preference-save', {
                  preset,
                  confirmed,
                  ...(model ? { model } : {}),
                  ...(effort ? { effort } : {}),
                }).catch((reason: unknown) => setError(String(reason)));
              }}
            >
              {locale === 'ru' ? 'Сохранить настройки' : 'Save settings'}
            </button>
          </div>
        )}
        <div className="workspace-actions">
          {!state?.active ? (
            <button
              type="button"
              className="ui-button"
              disabled={!connected}
              onClick={() =>
                void post('/_toudocu/api/agent-console/start', 'agent-session-start', {
                  provider,
                  preset,
                  ...(model ? { model } : {}),
                  ...(effort ? { effort } : {}),
                }).catch((reason: unknown) => setError(String(reason)))
              }
            >
              {locale === 'ru' ? 'Запустить агента' : 'Start agent'}
            </button>
          ) : (
            <>
              {state.activeTurn && state.settings?.capabilities.interrupt && (
                <button
                  type="button"
                  className="ui-button"
                  disabled={!connected}
                  onClick={() => sendSocket({ action: 'interrupt' })}
                >
                  {locale === 'ru' ? 'Остановить ответ' : 'Stop response'}
                </button>
              )}
              <button
                type="button"
                className="ui-button"
                disabled={!connected}
                onClick={() =>
                  void stopAgent().catch((reason: unknown) => setError(String(reason)))
                }
              >
                {locale === 'ru' ? 'Остановить агента' : 'Stop agent'}
              </button>
              {state.status === 'failed' && (
                <button
                  type="button"
                  className="ui-button"
                  disabled={!connected}
                  onClick={() =>
                    void post(
                      '/_toudocu/api/agent-console/cleanup',
                      'agent-session-cleanup',
                      {},
                    ).catch((reason: unknown) => setError(String(reason)))
                  }
                >
                  {locale === 'ru' ? 'Повторить завершение' : 'Retry shutdown'}
                </button>
              )}
            </>
          )}
          <TerminalButton
            locale={locale}
            active={Boolean(state?.terminal.active)}
            disabled={!connected}
            post={post}
          />
          {!state?.active && provider === 'codex' && (
            <button
              type="button"
              className="ui-button"
              disabled={!connected}
              onClick={() =>
                void loadHistory().catch((reason: unknown) => setError(String(reason)))
              }
            >
              {locale === 'ru' ? 'Недавние сессии' : 'Recent sessions'}
            </button>
          )}
        </div>
        {!state?.active && threads.length > 0 && (
          <ul className="agent-history">
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className="ui-button"
                  disabled={!connected}
                  onClick={() =>
                    void post('/_toudocu/api/agent-console/resume', 'agent-session-resume', {
                      threadID: thread.id,
                      provider,
                      preset,
                    }).catch((reason: unknown) => setError(String(reason)))
                  }
                >
                  {thread.name || thread.preview || thread.id}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="ui-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'agent'}
            onClick={() => setTab('agent')}
          >
            Agent View
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'output'}
            onClick={() => setTab('output')}
          >
            Command Output
          </button>
        </div>
        {tab === 'agent' ? (
          <AgentView
            events={events}
            state={state}
            locale={locale}
            connected={connected}
            post={post}
            sendSocket={sendSocket}
            onError={(reason) => setError(String(reason))}
            selectCommand={(id) => {
              setSelectedCommand(id);
              setTab('output');
            }}
          />
        ) : (
          <pre className="command-output">{selected?.output || selected?.command || ''}</pre>
        )}
        {state?.active && (
          <form className="agent-message" onSubmit={submit}>
            <input
              aria-label={locale === 'ru' ? 'Сообщение агенту' : 'Message to agent'}
              value={message}
              disabled={!connected}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
            <button type="submit" className="ui-button" disabled={!connected || !message.trim()}>
              {locale === 'ru' ? 'Отправить' : 'Send'}
            </button>
          </form>
        )}
        {state?.settings && (
          <p className="agent-effective-access">
            {locale === 'ru' ? 'Фактический доступ: ' : 'Effective access: '}
            {state.settings.effectiveAccess.known
              ? state.settings.effectiveAccess.unrestricted
                ? locale === 'ru'
                  ? 'без ограничений'
                  : 'unrestricted'
                : locale === 'ru'
                  ? 'ограниченный'
                  : 'restricted'
              : locale === 'ru'
                ? 'не подтверждён провайдером'
                : 'not reported by provider'}
          </p>
        )}
        {state?.terminal.active && <ProjectTerminal socket={socket} events={events} />}
      </dialog>
    </section>
  );
}

function AgentView({
  events,
  state,
  locale,
  connected,
  post,
  sendSocket,
  onError,
  selectCommand,
}: {
  events: AgentConsoleMessage[];
  state: AgentConsoleState['state'] | undefined;
  locale: Locale;
  connected: boolean;
  post(path: string, name: string, body: unknown): Promise<void>;
  sendSocket(value: unknown): void;
  onError(reason: unknown): void;
  selectCommand(id: string): void;
}) {
  return (
    <div className="agent-timeline" aria-live="polite">
      {state?.failure && <p role="alert">{state.failure}</p>}
      {state?.approvals?.map((approval) => (
        <div className="agent-approval" key={approval.requestID}>
          <p>{approval.reason || approval.kind}</p>
          {(['accept', 'decline', 'cancel'] as const).map((decision) => (
            <button
              type="button"
              className="ui-button"
              disabled={!connected}
              key={decision}
              onClick={() =>
                sendSocket({ action: 'approval', requestID: approval.requestID, decision })
              }
            >
              {decision}
            </button>
          ))}
        </div>
      ))}
      {state?.pending?.map((pending) => (
        <div className="agent-pending" key={pending.id}>
          <span>{pending.text}</span>
          <span className="ui-badge">{pending.state}</span>
          <button
            type="button"
            className="ui-button"
            disabled={!connected}
            onClick={() =>
              void post('/_toudocu/api/agent-console/pending/cancel', 'agent-pending-cancel', {
                id: pending.id,
              }).catch(onError)
            }
          >
            {locale === 'ru' ? 'Отменить' : 'Cancel'}
          </button>
        </div>
      ))}
      {events.map((entry) => {
        const event = entry.event;
        if (!event || event.type === 'command_output') return null;
        if (event.type.startsWith('command_')) {
          return (
            <button
              type="button"
              className="agent-command"
              key={entry.sequence}
              onClick={() => selectCommand(event.itemID ?? '')}
            >
              {event.command || event.status || 'Command'}
            </button>
          );
        }
        return <pre key={entry.sequence}>{event.text || event.status || event.type}</pre>;
      })}
    </div>
  );
}

function TerminalButton({
  locale,
  active,
  disabled,
  post,
}: {
  locale: Locale;
  active: boolean;
  disabled: boolean;
  post(path: string, name: string, body: unknown): Promise<void>;
}) {
  const operation = active ? 'stop' : 'start';
  const label = active
    ? locale === 'ru'
      ? 'Остановить терминал'
      : 'Stop terminal'
    : locale === 'ru'
      ? 'Запустить терминал'
      : 'Start terminal';
  return (
    <button
      type="button"
      className="ui-button"
      disabled={disabled}
      onClick={() =>
        void post(
          `/_toudocu/api/agent-console/terminal/${operation}`,
          `project-terminal-${operation}`,
          {},
        )
      }
    >
      {label}
    </button>
  );
}

interface CommandView {
  id: string;
  command: string;
  output: string;
}

function commandEvents(events: AgentConsoleMessage[]): CommandView[] {
  const commands = new Map<string, CommandView>();
  for (const { event } of events) {
    if (!event?.itemID || !event.type.startsWith('command_')) continue;
    const command = commands.get(event.itemID) ?? { id: event.itemID, command: '', output: '' };
    if (event.command) command.command = event.command;
    if (event.type === 'command_output' && event.text) command.output += event.text;
    commands.set(event.itemID, command);
  }
  return [...commands.values()];
}

async function assertResponse(response: Response): Promise<unknown> {
  const body = (await response.json()) as unknown;
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function ProjectTerminal({
  socket,
  events,
}: {
  socket: WebSocket | undefined;
  events: AgentConsoleMessage[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const socketRef = useRef(socket);
  const terminalRef = useRef<{ write(data: Uint8Array): void } | null>(null);
  const lastOutput = useRef(0);
  const eventsRef = useRef(events);
  socketRef.current = socket;
  eventsRef.current = events;

  const writeEvents = (messages: AgentConsoleMessage[]): void => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    for (const message of messages) {
      if (message.sequence <= lastOutput.current || message.kind !== 'terminal') continue;
      lastOutput.current = message.sequence;
      if (message.terminal?.type !== 'output') continue;
      terminal.write(
        Uint8Array.from(atob(message.terminal.data ?? ''), (char) => char.charCodeAt(0)),
      );
    }
  };

  useEffect(() => writeEvents(events), [events]);

  useEffect(() => {
    let active = true;
    let dispose = () => undefined;
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
      ([{ Terminal }, { FitAddon }]) => {
        if (!active || !container.current) return;
        const terminal = new Terminal({ convertEol: true });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(container.current);
        fit.fit();
        terminalRef.current = terminal;
        writeEvents(eventsRef.current);
        socketRef.current?.send(
          JSON.stringify({
            action: 'terminal-resize',
            columns: terminal.cols,
            rows: terminal.rows,
          }),
        );
        const input = terminal.onData((text) =>
          socketRef.current?.send(JSON.stringify({ action: 'terminal-input', text })),
        );
        dispose = () => {
          terminalRef.current = null;
          input.dispose();
          terminal.dispose();
        };
      },
    );
    return () => {
      active = false;
      dispose();
    };
  }, []);
  return <div className="project-terminal" ref={container} />;
}
