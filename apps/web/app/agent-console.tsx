import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  AgentConsoleMessageSchema,
  AgentConsoleStateSchema,
  AgentThreadSchema,
  type AgentConsoleMessage,
  type AgentConsoleState,
  type AgentConsoleInput,
  type AgentModel,
  type AgentThread,
} from '@toudocu/contracts';
import { translator, type Locale, type MessageKey } from './i18n.js';
import { ApiError, jsonRequest } from './workspace-api.js';
import { AgentVerification } from './agent-verification.js';
import { stripControlSequences } from './agent-console-output.js';
import { Icon, IconButton } from './ui/index.js';

const PANEL_STORAGE = 'toudocu.agent-console.panel';
const TAB_STORAGE = 'toudocu.agent-console.tab';
const WIDTH_STORAGE = 'toudocu.agent-console.width';

function action(name: string, body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-toudocu-action': name },
    body: JSON.stringify(body),
  };
}

export function AgentConsoleWorkspace({
  locale,
  view,
  onViewChange,
}: {
  locale: Locale;
  view: 'agent' | 'terminal' | null;
  onViewChange(view: 'agent' | 'terminal' | null): void;
}) {
  const { text, status } = translator(locale);
  const [consoleState, setConsoleState] = useState<AgentConsoleState>();
  const [events, setEvents] = useState<AgentConsoleMessage[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const open = view !== null;
  const setOpen = (value: boolean): void => onViewChange(value ? 'agent' : null);
  const [tab, setTab] = useState<'agent' | 'output'>('agent');
  const [selectedCommand, setSelectedCommand] = useState('');
  const [followLatest, setFollowLatest] = useState(true);
  const [width, setWidth] = useState(400);
  const [policy, setPolicy] = useState<'normal' | 'filesystem-read-only'>('normal');
  const [selection, setSelection] = useState('');
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [provider, setProvider] = useState('');
  const [preset, setPreset] = useState<'default' | 'full-access'>('default');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const latestState = useRef<AgentConsoleState['state'] | undefined>(undefined);
  const [socket, setSocket] = useState<WebSocket | undefined>(undefined);
  const lastSequence = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setOpen(sessionStorage.getItem(PANEL_STORAGE) === 'open');
      if (sessionStorage.getItem(TAB_STORAGE) === 'output') setTab('output');
      const savedWidth = Number(localStorage.getItem(WIDTH_STORAGE));
      if (savedWidth > 0 && Number.isFinite(savedWidth)) setWidth(clampPanelWidth(savedWidth));
    } catch {
      /* Storage is optional. */
    }
    const openConsole = (): void => setOpen(true);
    const constrain = (): void => setWidth((current) => clampPanelWidth(current));
    const select = (): void => {
      const selected = window.getSelection();
      if (selected?.anchorNode && !panelRef.current?.contains(selected.anchorNode))
        setSelection(selected.toString().trim());
    };
    window.addEventListener('toudocu:agent-console-open', openConsole);
    window.addEventListener('resize', constrain);
    document.addEventListener('selectionchange', select);
    return () => {
      window.removeEventListener('toudocu:agent-console-open', openConsole);
      window.removeEventListener('resize', constrain);
      document.removeEventListener('selectionchange', select);
    };
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(PANEL_STORAGE, open ? 'open' : 'closed');
    } catch {
      /* Storage is optional. */
    }
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_STORAGE, tab);
    } catch {
      /* Storage is optional. */
    }
  }, [tab]);

  useEffect(() => {
    const compose = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const detail = event.detail as
        { text?: unknown; policy?: unknown; send?: unknown } | undefined;
      if (typeof detail?.text !== 'string' || !detail.text.trim()) return;
      const nextPolicy = detail.policy === 'filesystem-read-only' ? detail.policy : 'normal';
      setOpen(true);
      setTab('agent');
      if (
        detail.send === true &&
        latestState.current?.active &&
        sendSocket({ action: 'message', text: detail.text, policy: nextPolicy })
      )
        return;
      setMessage(detail.text);
      setPolicy(nextPolicy);
      requestAnimationFrame(() => draftRef.current?.focus());
    };
    document.addEventListener('toudocu:agent-compose', compose);
    return () => document.removeEventListener('toudocu:agent-compose', compose);
  }, [locale]);

  useEffect(() => {
    if (!followLatest || !open) return;
    const container = tab === 'agent' ? timelineRef.current : outputRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [events, followLatest, open, tab]);

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
      const selection = modelSelection(
        value.setup.models,
        value.setup.preference.model,
        value.setup.preference.effort,
      );
      setModel(selection.model);
      setEffort(selection.effort);
    };

    void jsonRequest('/_toudocu/api/agent-console/')
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
        if (!active) return;
        let value: AgentConsoleMessage;
        try {
          value = AgentConsoleMessageSchema.parse(JSON.parse(String(data)));
        } catch (reason) {
          setError(String(reason));
          return;
        }
        if (value.kind !== 'replay_gap') {
          if (value.sequence <= lastSequence.current) return;
          lastSequence.current = value.sequence;
        }
        if (value.kind === 'state' && value.state) {
          if (value.state.active && !latestState.current?.active) {
            setEvents((current) => current.filter((entry) => entry.kind === 'terminal'));
            setSelectedCommand('');
            setFollowLatest(true);
          }
          latestState.current = value.state;
          const state = value.state;
          setConsoleState((current) => (current ? { ...current, state } : current));
        } else if (value.kind === 'replay_gap') {
          setEvents([]);
          setError(text('historyExpired'));
        } else {
          setEvents((current) => appendEvent(current, value));
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
    if (!connected) throw new Error(text('connectionLost'));
    setError('');
    const state = AgentConsoleStateSchema.shape.state.parse(
      await jsonRequest(path, action(name, body)),
    );
    if (state.active && !latestState.current?.active) {
      setEvents((current) => current.filter((entry) => entry.kind === 'terminal'));
      setSelectedCommand('');
      setFollowLatest(true);
    }
    latestState.current = state;
    setConsoleState((current) => (current ? { ...current, state } : current));
  };

  const sendSocket = (value: AgentConsoleInput): boolean => {
    if (value.action === 'message' && new TextEncoder().encode(value.text).length > 65_536) {
      setError(text('consoleMessageTooLong'));
      return false;
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError(text('connectionLost'));
      return false;
    }
    socketRef.current.send(JSON.stringify(value));
    return true;
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (
      !message.trim() ||
      !state?.active ||
      state.status === 'failed' ||
      state.status === 'stopping'
    )
      return;
    if (sendSocket({ action: 'message', text: message, policy })) {
      setMessage('');
      setPolicy('normal');
      setFollowLatest(true);
    }
  };

  const loadHistory = async (): Promise<void> => {
    setHistoryLoading(true);
    try {
      const body = (await jsonRequest(
        `/_toudocu/api/agent-console/history?provider=${encodeURIComponent(provider)}`,
      )) as { threads?: unknown };
      setThreads(AgentThreadSchema.array().parse(body.threads));
    } finally {
      setHistoryLoading(false);
    }
  };

  const commands = useMemo(() => commandEvents(events), [events]);
  const selected =
    (followLatest ? undefined : commands.find((command) => command.id === selectedCommand)) ??
    commands.at(-1);
  const copy = text('agentConsole');
  const state = consoleState?.state;
  const setup = consoleState?.setup;
  const efforts =
    setup?.models?.find((entry) => entry.id === model)?.supportedReasoningEfforts ?? [];
  const mutable = connected && !busy;

  const selectProvider = async (provider: string): Promise<void> => {
    setBusy(true);
    try {
      const value = AgentConsoleStateSchema.parse(
        await jsonRequest(`/_toudocu/api/agent-console/?provider=${encodeURIComponent(provider)}`),
      );
      const selected = modelSelection(value.setup.models, model, effort);
      setConsoleState((current) => ({ ...value, state: current?.state ?? value.state }));
      setProvider(value.setup.selectedProvider);
      setModel(selected.model);
      setEffort(selected.effort);
      setThreads([]);
      setHistoryOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (): Promise<boolean> => {
    const confirmed = preset === 'full-access' && window.confirm(text('allowFullAccess'));
    if (preset === 'full-access' && !confirmed) return false;
    await post('/_toudocu/api/agent-console/preference', 'agent-preference-save', {
      preset,
      confirmed,
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
    });
    return true;
  };

  const launch = async (threadID?: string): Promise<void> => {
    setBusy(true);
    try {
      if (!(await saveSettings())) return;
      await post(
        `/_toudocu/api/agent-console/${threadID ? 'resume' : 'start'}`,
        threadID ? 'agent-session-resume' : 'agent-session-start',
        {
          provider,
          preset,
          ...(threadID
            ? { threadID }
            : { ...(model ? { model } : {}), ...(effort ? { effort } : {}) }),
        },
      );
      setHistoryOpen(false);
      setFollowLatest(true);
    } finally {
      setBusy(false);
    }
  };

  const resize = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (event.type === 'pointermove' && !event.currentTarget.hasPointerCapture(event.pointerId))
      return;
    if (event.type === 'pointerdown') event.currentTarget.setPointerCapture(event.pointerId);
    const next = clampPanelWidth(window.innerWidth - event.clientX);
    setWidth(next);
    if (event.type === 'pointerup') {
      event.currentTarget.releasePointerCapture(event.pointerId);
      try {
        localStorage.setItem(WIDTH_STORAGE, String(next));
      } catch {
        /* Storage is optional. */
      }
    }
  };

  const stopAgent = async (): Promise<void> => {
    try {
      await post('/_toudocu/api/agent-console/stop', 'agent-session-stop', {
        discardPending: false,
      });
    } catch (reason) {
      if (!(reason instanceof ApiError) || reason.status !== 409 || !state?.pending?.length)
        throw reason;
      const confirmed = window.confirm(text('discardAndStop'));
      if (!confirmed) return;
      await post('/_toudocu/api/agent-console/stop', 'agent-session-stop', {
        discardPending: true,
      });
    }
  };

  return (
    <aside
      ref={panelRef}
      id="agent-console-panel"
      className="agent-console"
      data-open={open}
      hidden={!open}
      tabIndex={-1}
      style={{ '--agent-panel-width': `${width}px` } as CSSProperties}
      aria-label={copy}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          setOpen(false);
          document.getElementById('agent-console-toggle')?.focus();
        }
      }}
    >
      <div
        className="agent-console-resizer"
        role="separator"
        tabIndex={0}
        aria-label={text('consoleResize')}
        aria-orientation="vertical"
        aria-valuemin={320}
        aria-valuemax={640}
        aria-valuenow={width}
        onPointerDown={resize}
        onPointerMove={resize}
        onPointerUp={resize}
        onKeyDown={(event) => {
          const next =
            event.key === 'ArrowLeft'
              ? width + 16
              : event.key === 'ArrowRight'
                ? width - 16
                : event.key === 'Home'
                  ? 320
                  : event.key === 'End'
                    ? 640
                    : undefined;
          if (next === undefined) return;
          event.preventDefault();
          const value = clampPanelWidth(next);
          setWidth(value);
          try {
            localStorage.setItem(WIDTH_STORAGE, String(value));
          } catch {
            /* Storage is optional. */
          }
        }}
      />
      <header className="agent-console-header">
        <strong>{view === 'terminal' ? text('consoleTerminal') : text('agentMode')}</strong>
        <span
          className="connection-mark"
          data-connected={connected}
          title={text(connected ? 'consoleOnline' : 'consoleOffline')}
          role="img"
          aria-label={text(connected ? 'consoleOnline' : 'consoleOffline')}
        />
        <IconButton
          type="button"
          aria-label={text('close')}
          title={text('close')}
          onClick={() => {
            setOpen(false);
            document.getElementById('agent-console-toggle')?.focus();
          }}
        >
          <Icon name="close" />
        </IconButton>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="agent-workspace" hidden={view !== 'agent'}>
        <div className="ui-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            id="agent-conversation-tab"
            aria-controls="agent-conversation-panel"
            aria-selected={tab === 'agent'}
            onClick={() => setTab('agent')}
          >
            {text('consoleAgentView')}
          </button>
          <button
            type="button"
            role="tab"
            id="agent-output-tab"
            aria-controls="agent-output-panel"
            aria-selected={tab === 'output'}
            onClick={() => setTab('output')}
          >
            {text('consoleCommandOutput')}
          </button>
        </div>
        <label className="agent-follow">
          <input
            type="checkbox"
            checked={followLatest}
            onChange={(event) => setFollowLatest(event.currentTarget.checked)}
          />
          {text('consoleFollowLatest')}
        </label>
        {tab === 'agent' ? (
          <AgentView
            timelineRef={timelineRef}
            pauseFollow={() => setFollowLatest(false)}
            events={events}
            state={state}
            locale={locale}
            connected={connected}
            post={post}
            sendSocket={sendSocket}
            onError={(reason) => setError(String(reason))}
            selectCommand={(id) => {
              setFollowLatest(false);
              setSelectedCommand(id);
              setTab('output');
            }}
          />
        ) : (
          <div
            className="command-workspace"
            role="tabpanel"
            id="agent-output-panel"
            aria-labelledby="agent-output-tab"
          >
            <aside>
              {commands.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  aria-current={selected?.id === command.id ? 'true' : undefined}
                  onClick={() => {
                    setSelectedCommand(command.id);
                    setFollowLatest(false);
                  }}
                >
                  <code>{command.command || command.id}</code>
                  <span>{status(command.status || 'running')}</span>
                </button>
              ))}
            </aside>
            <section>
              {selected && (
                <header>
                  <code>{selected.command}</code>
                  <span>
                    {status(selected.status)}
                    {selected.exitCode !== undefined
                      ? ` · ${text('consoleExitCode')} ${selected.exitCode}`
                      : ''}
                    {selected.durationMillis !== undefined
                      ? ` · ${selected.durationMillis} ${text('consoleMilliseconds')}`
                      : ''}
                  </span>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(selected.output || selected.command)
                        .catch((reason: unknown) => setError(String(reason)))
                    }
                  >
                    {text('copy')}
                  </button>
                  <button
                    type="button"
                    className="ui-button"
                    onClick={() => {
                      setMessage(
                        `${text('consoleOutputPrompt')}\n\n${selected.command}\n${selected.output}`,
                      );
                      setPolicy('normal');
                      setTab('agent');
                      requestAnimationFrame(() => draftRef.current?.focus());
                    }}
                  >
                    {text('consoleSendOutput')}
                  </button>
                </header>
              )}
              {selected?.cwd && (
                <p>
                  <code>{selected.cwd}</code>
                </p>
              )}
              {selected?.truncated && <p role="status">{text('consoleTruncated')}</p>}
              <pre
                ref={outputRef}
                className="command-output"
                onScroll={(event) => {
                  const element = event.currentTarget;
                  if (element.scrollHeight - element.scrollTop - element.clientHeight > 40) {
                    setFollowLatest(false);
                    if (selected) setSelectedCommand(selected.id);
                  }
                }}
              >
                {selected?.output || selected?.command || text('consoleNoCommands')}
              </pre>
            </section>
          </div>
        )}
        <AgentVerification
          state={state}
          locale={locale}
          available={Boolean(setup?.verificationAvailable)}
          disabled={!mutable}
          post={post}
          onError={(reason) => setError(String(reason))}
        />
        <form className="agent-message" onSubmit={submit}>
          {selection && (
            <button
              type="button"
              className="ui-button"
              onClick={() => {
                setMessage((current) => [current, selection].filter(Boolean).join('\n\n'));
                setSelection('');
                draftRef.current?.focus();
              }}
            >
              {text('consoleSendSelection')}
            </button>
          )}
          <textarea
            ref={draftRef}
            rows={3}
            maxLength={65_536}
            aria-label={text('messageToAgent')}
            placeholder={text('messageToAgent')}
            value={message}
            onChange={(event) => {
              setMessage(event.currentTarget.value);
              setPolicy('normal');
            }}
          />
          {policy === 'filesystem-read-only' && (
            <span className="ui-badge">{text('consoleReadOnly')}</span>
          )}
          <IconButton
            type="submit"
            className="is-primary"
            aria-label={text('send')}
            title={text('send')}
            disabled={
              !mutable ||
              !state?.active ||
              state.status === 'failed' ||
              state.status === 'stopping' ||
              !message.trim() ||
              message.length > 65_536
            }
          >
            <Icon name="arrowUp" />
          </IconButton>
        </form>
      </div>
      <div className="terminal-workspace" hidden={view !== 'terminal'}>
        {!state?.terminal.active && <p className="console-empty">{text('terminalStartHint')}</p>}
        {state?.terminal.failure && <p role="alert">{state.terminal.failure}</p>}
        {state?.terminal.active && (
          <ProjectTerminal
            socket={socket}
            events={events}
            locale={locale}
            onError={(reason) => setError(String(reason))}
          />
        )}
      </div>
      <footer className="agent-console-dock">
        {view === 'agent' ? (
          <div className="workspace-actions">
            {state?.status && <span className="agent-session-status">{status(state.status)}</span>}
            {!state?.active ? (
              <IconButton
                type="button"
                aria-label={text('startAgent')}
                title={text('startAgent')}
                disabled={!mutable || !setup}
                onClick={() => void launch().catch((reason: unknown) => setError(String(reason)))}
              >
                <Icon name="play" />
              </IconButton>
            ) : (
              <>
                {state.activeTurn && state.settings?.capabilities.interrupt && (
                  <IconButton
                    type="button"
                    aria-label={text('stopResponse')}
                    title={text('stopResponse')}
                    disabled={!connected}
                    onClick={() => sendSocket({ action: 'interrupt' })}
                  >
                    <Icon name="stop" />
                  </IconButton>
                )}
                <IconButton
                  type="button"
                  aria-label={text('stopAgent')}
                  title={text('stopAgent')}
                  disabled={!connected}
                  onClick={() =>
                    void stopAgent().catch((reason: unknown) => setError(String(reason)))
                  }
                >
                  <Icon name="power" />
                </IconButton>
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
                    {text('retryShutdown')}
                  </button>
                )}
              </>
            )}
            {!state?.active && provider === 'codex' && (
              <IconButton
                type="button"
                aria-label={text('recentSessions')}
                title={text('recentSessions')}
                disabled={!mutable}
                aria-expanded={historyOpen}
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  if (!historyOpen)
                    void loadHistory().catch((reason: unknown) => setError(String(reason)));
                }}
              >
                <Icon name="history" />
              </IconButton>
            )}
          </div>
        ) : (
          state?.terminal.available && (
            <div className="workspace-actions">
              <TerminalButton
                locale={locale}
                active={Boolean(state.terminal.active)}
                disabled={!mutable}
                post={post}
                onError={(reason) => setError(String(reason))}
              />
            </div>
          )
        )}
        {view === 'agent' && setup && (
          <div className="agent-configuration">
            <div className="agent-settings">
              <label>
                {text('consoleProvider')}
                <select
                  value={provider}
                  disabled={!mutable || Boolean(state?.active)}
                  onChange={(event) =>
                    void selectProvider(event.currentTarget.value).catch((reason: unknown) =>
                      setError(String(reason)),
                    )
                  }
                >
                  {setup.availableProviders.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label>
                {text('access')}
                <select
                  value={preset}
                  disabled={!mutable || Boolean(state?.active)}
                  onChange={(event) =>
                    setPreset(event.currentTarget.value as 'default' | 'full-access')
                  }
                >
                  <option value="default">{text('consoleDefault')}</option>
                  <option value="full-access">{text('consoleFullAccess')}</option>
                </select>
              </label>
              <label>
                {text('consoleModel')}
                <select
                  value={model}
                  disabled={!mutable || Boolean(state?.active)}
                  onChange={(event) => {
                    const next = event.currentTarget.value;
                    setModel(next);
                    setEffort(
                      setup.models?.find((entry) => entry.id === next)?.defaultReasoningEffort ??
                        '',
                    );
                  }}
                >
                  {setup.models?.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.displayName || entry.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text('consoleReasoning')}
                {efforts.length ? (
                  <select
                    value={effort}
                    disabled={!mutable || Boolean(state?.active)}
                    onChange={(event) => setEffort(event.currentTarget.value)}
                  >
                    {efforts.map((entry) => (
                      <option key={entry.reasoningEffort} value={entry.reasoningEffort}>
                        {effortLabel(entry.reasoningEffort, locale)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={effort}
                    disabled={!mutable || Boolean(state?.active)}
                    onChange={(event) => setEffort(event.currentTarget.value)}
                  />
                )}
              </label>
              {state?.settings && (
                <p className="agent-effective-access">
                  {text('effectiveAccess')}
                  {state.settings.effectiveAccess.known
                    ? state.settings.effectiveAccess.unrestricted
                      ? text('unrestricted')
                      : text('restricted')
                    : text('notReported')}
                </p>
              )}
              <button
                type="button"
                className="ui-button"
                disabled={!mutable || Boolean(state?.active)}
                onClick={() =>
                  void saveSettings().catch((reason: unknown) => setError(String(reason)))
                }
              >
                {text('saveSettings')}
              </button>
            </div>
          </div>
        )}
        {view === 'agent' && !state?.active && historyOpen && (
          <ul className="agent-history">
            {historyLoading ? (
              <li>{text('consoleLoading')}</li>
            ) : (
              threads.length === 0 && <li>{text('consoleNoHistory')}</li>
            )}
            {threads.map((thread) => (
              <li key={thread.id}>
                <button
                  type="button"
                  className="ui-button"
                  disabled={!mutable}
                  onClick={() =>
                    void launch(thread.id).catch((reason: unknown) => setError(String(reason)))
                  }
                >
                  {thread.name || thread.preview || thread.id}
                </button>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </aside>
  );
}

function AgentView({
  timelineRef,
  pauseFollow,
  events,
  state,
  locale,
  connected,
  post,
  sendSocket,
  onError,
  selectCommand,
}: {
  timelineRef: RefObject<HTMLDivElement | null>;
  pauseFollow(): void;
  events: AgentConsoleMessage[];
  state: AgentConsoleState['state'] | undefined;
  locale: Locale;
  connected: boolean;
  post(path: string, name: string, body: unknown): Promise<void>;
  sendSocket(value: AgentConsoleInput): boolean;
  onError(reason: unknown): void;
  selectCommand(id: string): void;
}) {
  const { text, status } = translator(locale);
  const conversation = useMemo(() => conversationEvents(events), [events]);
  return (
    <div
      ref={timelineRef}
      className="agent-timeline"
      role="tabpanel"
      id="agent-conversation-panel"
      aria-labelledby="agent-conversation-tab"
      aria-live="polite"
      onScroll={(event) => {
        const element = event.currentTarget;
        if (element.scrollHeight - element.scrollTop - element.clientHeight > 40) pauseFollow();
      }}
    >
      {state?.failure && <p role="alert">{state.failure}</p>}
      {state?.approvals?.map((approval) => (
        <div className="agent-approval" key={approval.requestID}>
          <p>{approval.reason || text('consoleApproval')}</p>
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
              {text(
                decision === 'accept'
                  ? 'consoleAccept'
                  : decision === 'decline'
                    ? 'consoleDecline'
                    : 'cancel',
              )}
            </button>
          ))}
        </div>
      ))}
      {state?.pending?.map((pending) => (
        <div className="agent-pending" key={pending.id}>
          <span>{pending.text}</span>
          <span className="ui-badge">{status(pending.state)}</span>
          {pending.reason && <p>{status(pending.reason)}</p>}
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
            {text('cancel')}
          </button>
        </div>
      ))}
      {conversation.length === 0 && <p>{text('consoleEmpty')}</p>}
      {conversation.map((entry) => {
        if (entry.kind === 'command') {
          return (
            <button
              type="button"
              className="agent-command"
              key={`${entry.kind}:${entry.id}`}
              onClick={() => selectCommand(entry.id)}
            >
              <code>{entry.text || text('consoleCommand')}</code>
              <span>{status(entry.status || 'running')}</span>
            </button>
          );
        }
        return (
          <article
            key={`${entry.kind}:${entry.id}`}
            className={`agent-conversation-message is-${entry.kind}`}
          >
            <strong>
              {text(
                entry.kind === 'user'
                  ? 'consoleYou'
                  : entry.kind === 'agent'
                    ? 'consoleAgent'
                    : entry.kind === 'files'
                      ? 'consoleFilesChanged'
                      : 'errors',
              )}
            </strong>
            <pre>{entry.text}</pre>
          </article>
        );
      })}
    </div>
  );
}

function TerminalButton({
  locale,
  active,
  disabled,
  post,
  onError,
}: {
  locale: Locale;
  active: boolean;
  disabled: boolean;
  post(path: string, name: string, body: unknown): Promise<void>;
  onError(reason: unknown): void;
}) {
  const { text } = translator(locale);
  const operation = active ? 'stop' : 'start';
  const label = active ? text('stopTerminal') : text('startTerminal');
  return (
    <button
      type="button"
      className="ui-icon-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() =>
        void post(
          `/_toudocu/api/agent-console/terminal/${operation}`,
          `project-terminal-${operation}`,
          {},
        ).catch(onError)
      }
    >
      <Icon name={active ? 'stop' : 'play'} />
    </button>
  );
}

interface CommandView {
  id: string;
  command: string;
  output: string;
  status: string;
  exitCode?: number;
  durationMillis?: number;
  truncated: boolean;
  cwd?: string;
}

function commandEvents(events: AgentConsoleMessage[]): CommandView[] {
  const commands = new Map<string, CommandView>();
  for (const { event } of events) {
    if (!event || !event.type.startsWith('command_')) continue;
    const id = event.itemID || event.turnID || 'current';
    const command = commands.get(id) ?? {
      id,
      command: '',
      output: '',
      status: 'running',
      truncated: false,
    };
    if (event.command) command.command = event.command;
    if (event.type === 'command_output' && event.text)
      command.output += stripControlSequences(event.text);
    if (event.cwd) command.cwd = event.cwd;
    if (event.status) command.status = event.status;
    if (event.exitCode !== undefined) command.exitCode = event.exitCode;
    if (event.durationMillis !== undefined) command.durationMillis = event.durationMillis;
    if (event.truncated) command.truncated = true;
    commands.set(id, command);
  }
  return [...commands.values()];
}

function clampPanelWidth(width: number): number {
  return Math.max(320, Math.min(width, 640, window.innerWidth * 0.45));
}

function modelSelection(
  models: AgentModel[] = [],
  model = '',
  effort = '',
): { model: string; effort: string } {
  const selected =
    models.find((entry) => entry.id === model) ??
    models.find((entry) => entry.isDefault) ??
    models[0];
  if (!selected) return { model, effort };
  return {
    model: selected.id,
    effort: selected.supportedReasoningEfforts.some((entry) => entry.reasoningEffort === effort)
      ? effort
      : selected.defaultReasoningEffort ||
        selected.supportedReasoningEfforts[0]?.reasoningEffort ||
        '',
  };
}

function effortLabel(effort: string, locale: Locale): string {
  const keys: Record<string, MessageKey> = {
    none: 'consoleEffortNone',
    minimal: 'consoleEffortMinimal',
    low: 'consoleEffortLow',
    medium: 'consoleEffortMedium',
    high: 'consoleEffortHigh',
    xhigh: 'consoleEffortExtraHigh',
    max: 'consoleEffortMax',
    ultra: 'consoleEffortUltra',
  };
  const key = keys[effort];
  return key ? translator(locale).text(key) : effort;
}

function appendEvent(
  events: AgentConsoleMessage[],
  message: AgentConsoleMessage,
): AgentConsoleMessage[] {
  if (message.kind === 'terminal') {
    if (message.terminal?.type === 'exit')
      return events.filter((entry) => entry.kind !== 'terminal');
    const terminal = events.filter((entry) => entry.kind === 'terminal');
    const oldest = terminal.at(-511)?.sequence ?? 0;
    return [
      ...events.filter((entry) => entry.kind !== 'terminal' || entry.sequence >= oldest),
      message,
    ];
  }
  if (message.event?.type === 'session_started')
    return [...events.filter((entry) => entry.kind === 'terminal'), message];
  const event = message.event;
  if (event && (event.type === 'message_delta' || event.type === 'command_output')) {
    const index = events.findIndex(
      (entry) =>
        entry.event?.type === event.type &&
        entry.event.itemID === event.itemID &&
        entry.event.turnID === event.turnID,
    );
    const previous = events[index]?.event;
    if (previous) {
      const next = [...events];
      next[index] = {
        ...message,
        event: {
          ...event,
          text: (previous.text ?? '') + (event.text ?? ''),
          truncated: Boolean(previous.truncated || event.truncated),
        },
      };
      return next;
    }
  }
  return [...events, message];
}

interface ConversationEntry {
  id: string;
  kind: 'user' | 'agent' | 'command' | 'files' | 'error';
  text: string;
  status?: string;
}

function conversationEvents(events: AgentConsoleMessage[]): ConversationEntry[] {
  const entries = new Map<string, ConversationEntry>();
  for (const { event, sequence } of events) {
    if (!event || event.type === 'command_output') continue;
    const kind =
      event.type === 'user_message'
        ? 'user'
        : event.type === 'message_delta'
          ? 'agent'
          : event.type.startsWith('command_')
            ? 'command'
            : event.type === 'files_changed'
              ? 'files'
              : event.type === 'error'
                ? 'error'
                : undefined;
    if (!kind) continue;
    const id = event.itemID || event.turnID || (kind === 'command' ? 'current' : String(sequence));
    const key = `${kind}:${id}`;
    const previous = entries.get(key);
    entries.set(key, {
      id,
      kind,
      text:
        kind === 'command'
          ? event.command || previous?.text || ''
          : (previous?.text ?? '') + stripControlSequences(event.text ?? ''),
      ...(event.status
        ? { status: event.status }
        : previous?.status
          ? { status: previous.status }
          : {}),
    });
  }
  return [...entries.values()];
}

function ProjectTerminal({
  socket,
  events,
  locale,
  onError,
}: {
  socket: WebSocket | undefined;
  events: AgentConsoleMessage[];
  locale: Locale;
  onError(reason: unknown): void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const socketRef = useRef(socket);
  const terminalRef = useRef<{ write(data: Uint8Array): void } | null>(null);
  const lastOutput = useRef(0);
  const eventsRef = useRef(events);
  const errorRef = useRef(onError);
  socketRef.current = socket;
  eventsRef.current = events;
  errorRef.current = onError;

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
    let dispose: () => void = () => undefined;
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')])
      .then(([{ Terminal }, { FitAddon }]) => {
        if (!active || !container.current) return;
        const terminal = new Terminal({ convertEol: false });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(container.current);
        fit.fit();
        terminalRef.current = terminal;
        writeEvents(eventsRef.current);
        const send = (value: AgentConsoleInput): void => {
          if (socketRef.current?.readyState === WebSocket.OPEN)
            socketRef.current.send(JSON.stringify(value));
        };
        const resize = (): void => {
          if (!container.current?.clientWidth || !container.current.clientHeight) return;
          fit.fit();
          if (terminal.cols >= 2 && terminal.rows >= 2)
            send({
              action: 'terminal-resize',
              columns: Math.min(500, terminal.cols),
              rows: Math.min(500, terminal.rows),
            });
        };
        const observer = new ResizeObserver(resize);
        observer.observe(container.current);
        resize();
        const input = terminal.onData((text) => send({ action: 'terminal-input', text }));
        dispose = () => {
          terminalRef.current = null;
          input.dispose();
          observer.disconnect();
          terminal.dispose();
        };
      })
      .catch((reason: unknown) => errorRef.current(reason));
    return () => {
      active = false;
      dispose();
    };
  }, []);
  return (
    <div
      className="project-terminal"
      ref={container}
      aria-label={translator(locale).text('consoleTerminal')}
    />
  );
}
