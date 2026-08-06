import { basicSetup, EditorView } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { setDiagnostics } from '@codemirror/lint';
import { MergeView } from '@codemirror/merge';
function languageExtension(language: any) {
    if (language === 'json')
        return json();
    if (language === 'yaml')
        return yaml();
    return markdown();
}
function position(view: any, line: any, column: any) {
    const safeLine: any = Math.max(1, Math.min(Number(line) || 1, view.state.doc.lines));
    const record: any = view.state.doc.line(safeLine);
    return Math.min(record.to, record.from + Math.max(0, (Number(column) || 1) - 1));
}
function appearanceTheme(theme: any) {
    return EditorView.theme({
        '&': { color: 'var(--text)', backgroundColor: 'var(--surface)' },
        '.cm-content': { caretColor: 'var(--accent)' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-soft)' },
        '.cm-gutters': { color: 'var(--muted)', backgroundColor: 'var(--surface-soft)', borderRightColor: 'var(--border)' },
        '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)' },
    }, { dark: theme === 'dark' });
}
const currentTheme: any = () => document.documentElement.dataset.theme || 'light';
window.DocuDocuCodeMirror = {
    createMerge({ parent, before, after, language }: any) {
        const themeA: any = new Compartment();
        const themeB: any = new Compartment();
        const readOnly: any = [basicSetup, languageExtension(language), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)];
        const view: any = new MergeView({
            parent,
            a: { doc: before, extensions: [readOnly, themeA.of(appearanceTheme(currentTheme()))] },
            b: { doc: after, extensions: [readOnly, themeB.of(appearanceTheme(currentTheme()))] },
            collapseUnchanged: { margin: 3, minSize: 6 },
            highlightChanges: true,
            gutter: true,
        });
        return {
            destroy: () => view.destroy(),
            setTheme(theme: any) {
                view.a.dispatch({ effects: themeA.reconfigure(appearanceTheme(theme)) });
                view.b.dispatch({ effects: themeB.reconfigure(appearanceTheme(theme)) });
            },
        };
    },
    create({ parent, doc, language, onChange }: any) {
        let applying: any = false;
        const themeCompartment: any = new Compartment();
        const view: any = new EditorView({
            parent,
            state: EditorState.create({
                doc,
                extensions: [
                    basicSetup,
                    languageExtension(language),
                    EditorView.lineWrapping,
                    themeCompartment.of(appearanceTheme(currentTheme())),
                    EditorView.updateListener.of((update: any) => {
                        if (update.docChanged && !applying)
                            onChange();
                    }),
                ],
            }),
        });
        return {
            getValue: () => view.state.doc.toString(),
            setValue(value: any) {
                applying = true;
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
                applying = false;
            },
            focus: () => view.focus(),
            destroy: () => view.destroy(),
            setTheme(theme: any) { view.dispatch({ effects: themeCompartment.reconfigure(appearanceTheme(theme)) }); },
            gotoLine(line: any, column: any) {
                const anchor: any = position(view, line, column);
                view.dispatch({ selection: { anchor }, scrollIntoView: true });
                view.focus();
            },
            setDiagnostics(diagnostics: any) {
                view.dispatch(setDiagnostics(view.state, diagnostics.map((item: any) => {
                    const from: any = position(view, item.line, item.column);
                    return { from, to: Math.min(view.state.doc.length, from + 1), severity: item.severity === 'error' ? 'error' : 'warning', message: item.message, source: item.code };
                })));
            },
        };
    },
};

