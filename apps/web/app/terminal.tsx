import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  TerminalMessageSchema,
  TerminalStateSchema,
  type TerminalMessage,
  type TerminalInput,
  type TerminalState,
} from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { action, jsonRequest } from './workspace-api.js';
import { Icon, IconButton } from './ui/index.js';

const WIDTH_STORAGE = 'toudocu.terminal.width';

export function TerminalWorkspace({
  locale,
  open,
  onOpenChange,
}: {
  locale: Locale;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { text } = translator(locale);
  const [state, setState] = useState<TerminalState>();
  const [events, setEvents] = useState<TerminalMessage[]>([]);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState<WebSocket>();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [width, setWidth] = useState(400);
  const panelRef = useRef<HTMLElement>(null);
  const lastSequence = useRef(0);

  useEffect(() => {
    try {
      const savedWidth = Number(localStorage.getItem(WIDTH_STORAGE));
      if (savedWidth > 0 && Number.isFinite(savedWidth)) setWidth(clampPanelWidth(savedWidth));
    } catch {
      /* Storage is optional. */
    }
    const constrain = (): void => setWidth((current) => clampPanelWidth(current));
    window.addEventListener('resize', constrain);
    return () => window.removeEventListener('resize', constrain);
  }, []);
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  useEffect(() => {
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let connection: WebSocket | undefined;
    const connect = (): void => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = new URL(`${protocol}//${location.host}/_toudocu/api/terminal/ws`);
      url.searchParams.set('since', String(lastSequence.current));
      const current = new WebSocket(url);
      connection = current;
      current.onopen = () => {
        if (!active) return;
        setConnected(true);
        setError('');
        setSocket(current);
      };
      current.onmessage = ({ data }) => {
        if (!active) return;
        try {
          const value = TerminalMessageSchema.parse(JSON.parse(String(data)));
          if (value.kind === 'replay_gap') {
            setEvents([]);
            setError(text('historyExpired'));
            return;
          }
          if (value.sequence <= lastSequence.current) return;
          lastSequence.current = value.sequence;
          if (value.kind === 'state' && value.state) setState(value.state);
          if (value.kind === 'terminal') {
            setEvents((current) =>
              value.terminal?.type === 'exit' ? [] : [...current.slice(-511), value],
            );
          }
        } catch (reason) {
          setError(String(reason));
        }
      };
      current.onclose = () => {
        if (!active) return;
        setConnected(false);
        setSocket(undefined);
        retry = setTimeout(connect, 500);
      };
      current.onerror = () => current.close();
    };
    connect();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      connection?.close();
    };
  }, [locale]);

  const post = async (path: string, name: string, body: unknown): Promise<void> => {
    if (!connected) throw new Error(text('connectionLost'));
    setBusy(true);
    setError('');
    try {
      setState(TerminalStateSchema.parse(await jsonRequest(path, action('POST', name, body))));
    } finally {
      setBusy(false);
    }
  };
  const close = (): void => {
    onOpenChange(false);
    document.getElementById('terminal-toggle')?.focus();
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

  return (
    <aside
      ref={panelRef}
      id="terminal-panel"
      className="terminal-panel"
      hidden={!open}
      tabIndex={-1}
      style={{ '--terminal-panel-width': `${width}px` } as CSSProperties}
      aria-label={text('consoleTerminal')}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) close();
      }}
    >
      <div
        className="terminal-resizer"
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

      <header className="terminal-header">
        <Icon name="terminal" />
        <strong>{text('consoleTerminal')}</strong>
        <span
          className="connection-mark"
          data-connected={connected}
          role="img"
          aria-label={text(connected ? 'consoleOnline' : 'consoleOffline')}
          title={text(connected ? 'consoleOnline' : 'consoleOffline')}
        />
        <IconButton aria-label={text('close')} title={text('close')} onClick={close}>
          <Icon name="close" />
        </IconButton>
      </header>
      {error && (
        <p className="terminal-error" role="alert">
          {error}
        </p>
      )}
      <div className="terminal-workspace">
        {!state?.active && (
          <div className="terminal-empty">
            <Icon name="terminal" />
            <p>{text('terminalStartHint')}</p>
          </div>
        )}
        {state?.failure && (
          <p className="terminal-error" role="alert">
            {state.failure}
          </p>
        )}
        {state?.active && (
          <ProjectTerminal
            socket={socket}
            events={events}
            locale={locale}
            onError={(reason) => setError(String(reason))}
          />
        )}
      </div>
      <footer className="terminal-dock">
        {state?.available && (
          <TerminalButton
            locale={locale}
            active={state.active}
            disabled={!connected || busy}
            post={post}
            onError={(reason) => setError(String(reason))}
          />
        )}
      </footer>
    </aside>
  );
}

function clampPanelWidth(width: number): number {
  return Math.min(640, Math.max(320, Math.min(width, window.innerWidth)));
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
        void post(`/_toudocu/api/terminal/${operation}`, `project-terminal-${operation}`, {}).catch(
          onError,
        )
      }
    >
      <Icon name={active ? 'stop' : 'play'} />
    </button>
  );
}

function ProjectTerminal({
  socket,
  events,
  locale,
  onError,
}: {
  socket: WebSocket | undefined;
  events: TerminalMessage[];
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

  const writeEvents = (messages: TerminalMessage[]): void => {
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
        const send = (value: TerminalInput): void => {
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
