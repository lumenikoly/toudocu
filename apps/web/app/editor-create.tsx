import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  EditorSavedFileResponseSchema,
  type EditorFileList,
  type EditorSavedFileResponse,
} from '@toudocu/contracts';
import { action, jsonRequest } from './workspace-api.js';
import { translator, type Locale } from './i18n.js';

export function EditorCreateDialog({
  templates,
  locale,
  onClose,
  onCreated,
}: {
  templates: EditorFileList['templates'];
  locale: Locale;
  onClose: () => void;
  onCreated: (file: EditorSavedFileResponse) => void;
}) {
  const { text, documentType } = translator(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const [key, setKey] = useState('draft');
  const template = templates.find((item) => item.key === key) ?? templates[0];
  const [language, setLanguage] = useState<Locale>(locale);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    setFields(
      Object.fromEntries(
        template?.fields.map((field) => [field.name, field.options?.[0] ?? '']) ?? [],
      ),
    );
    if (template && !template.languages.includes(language))
      setLanguage(template.languages[0] ?? locale);
  }, [template?.key]);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!template || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = EditorSavedFileResponseSchema.parse(
        await jsonRequest(
          '/_toudocu/api/editor/create',
          action('POST', 'create', { template: template.key, language, fields }),
        ),
      );
      onCreated(result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const fieldLabel = (name: string, fallback: string): string => {
    if (name === 'id') return text('editorIdentifier');
    if (name === 'title') return text('editorTitle');
    if (name === 'area') return text('editorArea');
    if (name === 'type') return text('editorType');
    return fallback;
  };
  return (
    <dialog
      ref={dialog}
      className="editor-create-dialog"
      aria-labelledby="editor-create-title"
      onClose={onClose}
      onCancel={(event) => {
        if (busy) event.preventDefault();
      }}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header>
          <h2 id="editor-create-title">{text('editorCreateDocument')}</h2>
          <button type="button" disabled={busy} onClick={onClose}>
            {text('close')}
          </button>
        </header>
        <label>
          {text('editorTemplate')}
          <select
            disabled={busy}
            value={template?.key ?? ''}
            onChange={(event) => setKey(event.currentTarget.value)}
          >
            {templates.map((item) => (
              <option key={item.key} value={item.key}>
                {documentType(item.key === 'task-init' ? 'work' : item.key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {text('editorLanguage')}
          <select
            disabled={busy}
            value={language}
            onChange={(event) => setLanguage(event.currentTarget.value === 'ru' ? 'ru' : 'en')}
          >
            {template?.languages.map((item) => (
              <option key={item} value={item}>
                {text(item === 'ru' ? 'editorRussian' : 'editorEnglish')}
              </option>
            ))}
          </select>
        </label>
        {template?.fields.map((field) => (
          <label key={field.name}>
            {fieldLabel(field.name, field.label)}
            {field.type === 'select' ? (
              <select
                disabled={busy}
                required={field.required}
                value={fields[field.name] ?? ''}
                onChange={(event) =>
                  setFields({ ...fields, [field.name]: event.currentTarget.value })
                }
              >
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {field.name === 'type' ? documentType(option) : option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                disabled={busy}
                required={field.required}
                value={fields[field.name] ?? ''}
                onChange={(event) =>
                  setFields({ ...fields, [field.name]: event.currentTarget.value })
                }
              />
            )}
          </label>
        ))}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            {text('cancel')}
          </button>
          <button type="submit" disabled={busy || !template}>
            {text(busy ? 'editorCreating' : 'create')}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
