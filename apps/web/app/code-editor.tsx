import { useEffect, useRef, type RefObject } from 'react';
import { basicSetup, EditorView } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { javascript } from '@codemirror/lang-javascript';
import { go } from '@codemirror/lang-go';
import { java } from '@codemirror/lang-java';
import { setDiagnostics } from '@codemirror/lint';
import type { EditorFile } from '@toudocu/contracts';

export interface CodeEditorHandle {
  goto(line: number, column: number): void;
}

function position(view: EditorView, line: number, column: number): number {
  const record = view.state.doc.line(Math.max(1, Math.min(line || 1, view.state.doc.lines)));
  // Source positions use UTF-8 bytes; CodeMirror uses UTF-16 code units.
  const encoder = new TextEncoder();
  let bytes = 0;
  let offset = 0;
  for (const character of record.text) {
    bytes += encoder.encode(character).length;
    if (bytes > Math.max(0, column - 1)) break;
    offset += character.length;
  }
  return record.from + offset;
}

function theme() {
  return EditorView.theme(
    {
      '&': { height: '100%', color: 'var(--td-text)', backgroundColor: 'var(--td-surface)' },
      '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--td-font-mono)' },
      '.cm-content': { caretColor: 'var(--td-accent)' },
      '.cm-cursor': { borderLeftColor: 'var(--td-accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
        backgroundColor: 'var(--td-accent-soft)',
      },
      '.cm-gutters': {
        color: 'var(--td-text-muted)',
        backgroundColor: 'var(--td-surface-muted)',
        borderRightColor: 'var(--td-border)',
      },
      '.cm-activeLine, .cm-activeLineGutter': {
        backgroundColor: 'color-mix(in srgb, var(--td-accent) 7%, transparent)',
      },
    },
    { dark: document.documentElement.dataset.theme === 'dark' },
  );
}

function languageExtension(language: EditorFile['language']) {
  if (language === 'json') return json();
  if (language === 'yaml') return yaml();
  return markdown({
    codeLanguages: (name) => {
      if (/^(js|javascript|jsx)$/iu.test(name)) return javascript({ jsx: true }).language;
      if (/^(ts|typescript|tsx)$/iu.test(name))
        return javascript({ typescript: true, jsx: true }).language;
      if (name === 'go') return go().language;
      if (name === 'java') return java().language;
      if (name === 'json') return json().language;
      if (/^ya?ml$/iu.test(name)) return yaml().language;
      return null;
    },
  });
}

export function CodeEditor({
  file,
  content,
  diagnostics,
  handle,
  onChange,
}: {
  file: EditorFile;
  content: string;
  diagnostics: EditorFile['diagnostics'];
  handle: RefObject<CodeEditorHandle | null>;
  onChange: (value: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const applying = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    const appearance = new Compartment();
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          languageExtension(file.language),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': file.path }),
          appearance.of(theme()),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applying.current) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    editor.current = view;
    handle.current = {
      goto(line, column) {
        view.dispatch({
          selection: { anchor: position(view, line, column) },
          scrollIntoView: true,
        });
        view.focus();
      },
    };
    const observer = new MutationObserver(() =>
      view.dispatch({ effects: appearance.reconfigure(theme()) }),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => {
      observer.disconnect();
      view.destroy();
      editor.current = null;
      handle.current = null;
    };
  }, [file.path, file.language]);
  useEffect(() => {
    const view = editor.current;
    if (!view || view.state.doc.toString() === content) return;
    applying.current = true;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: content } });
    applying.current = false;
  }, [content]);
  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    view.dispatch(
      setDiagnostics(
        view.state,
        diagnostics
          .filter((item) => item.path === file.path)
          .map((item) => {
            const from = position(view, item.line, item.column);
            return {
              from,
              to: Math.min(from + 1, view.state.doc.length),
              severity: item.severity,
              message: item.message,
              source: item.code,
            };
          }),
      ),
    );
  }, [diagnostics, file.path]);
  return <div className="editor-code" ref={host} />;
}
