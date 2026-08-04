import { basicSetup, EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { setDiagnostics } from '@codemirror/lint';
import { MergeView } from '@codemirror/merge';

function languageExtension(language) {
  if (language === 'json') return json();
  if (language === 'yaml') return yaml();
  return markdown();
}

function position(view, line, column) {
  const safeLine = Math.max(1, Math.min(Number(line) || 1, view.state.doc.lines));
  const record = view.state.doc.line(safeLine);
  return Math.min(record.to, record.from + Math.max(0, (Number(column) || 1) - 1));
}

window.DocuDocuCodeMirror = {
	createMerge({ parent, before, after, language }) {
		const readOnly = [basicSetup, languageExtension(language), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)];
		const view = new MergeView({
			parent,
			a: { doc: before, extensions: readOnly },
			b: { doc: after, extensions: readOnly },
			collapseUnchanged: { margin: 3, minSize: 6 },
			highlightChanges: true,
			gutter: true,
		});
		return { destroy: () => view.destroy() };
	},
  create({ parent, doc, language, onChange }) {
    let applying = false;
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        extensions: [
          basicSetup,
          languageExtension(language),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applying) onChange();
          }),
        ],
      }),
    });
    return {
      getValue: () => view.state.doc.toString(),
      setValue(value) {
        applying = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
        applying = false;
      },
      focus: () => view.focus(),
      destroy: () => view.destroy(),
      gotoLine(line, column) {
        const anchor = position(view, line, column);
        view.dispatch({ selection: { anchor }, scrollIntoView: true });
        view.focus();
      },
      setDiagnostics(diagnostics) {
        view.dispatch(setDiagnostics(view.state, diagnostics.map((item) => {
          const from = position(view, item.line, item.column);
          return { from, to: Math.min(view.state.doc.length, from + 1), severity: item.severity === 'error' ? 'error' : 'warning', message: item.message, source: item.code };
        })));
      },
    };
  },
};
