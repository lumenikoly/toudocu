(() => {
  'use strict';
  const API = '/_docgent/api/editor';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = {
    files: [], templates: [], revision: '', etag: '', current: null,
    baseline: '', dirty: false, external: null, view: 'editor', editor: null,
  };
  const elements = {
    tree: $('[data-tree]'), treeList: $('[data-file-tree]'), filter: $('[data-file-filter]'),
    path: $('[data-current-path]'), dirty: $('[data-dirty-state]'), save: $('[data-save]'),
    raw: $('[data-raw-link]'), fallback: $('[data-editor-fallback]'), host: $('[data-editor-host]'),
    stage: $('.editor-stage'), preview: $('[data-preview]'), diagnostics: $('[data-diagnostics]'),
    diagnosticCount: $('[data-diagnostic-count]'), conflict: $('[data-conflict]'), conflictMessage: $('[data-conflict-message]'),
    conflictLoad: $('[data-conflict-load]'), conflictOverwrite: $('[data-conflict-overwrite]'),
    conflictDownload: $('[data-conflict-download]'), toast: $('[data-toast]'),
    dialog: $('[data-create-dialog]'), form: $('[data-create-form]'), template: $('[data-template-select]'),
    language: $('[data-template-language]'), fields: $('[data-template-fields]'), createError: $('[data-create-error]'),
  };

  async function request(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    if (response.status === 304) return { response, data: null };
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message || `HTTP ${response.status}`);
      error.code = data?.error?.code;
      error.details = data?.error?.details;
      error.status = response.status;
      throw error;
    }
    return { response, data };
  }

  function actionOptions(action, body, method = 'POST') {
    return {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Docgent-Action': action, Accept: 'application/json' },
      body: JSON.stringify(body),
    };
  }

  function announce(message, error = false) {
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', error);
    elements.toast.classList.add('is-visible');
    window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
  }

  function currentContent() {
    return state.editor ? state.editor.getValue() : elements.fallback.value;
  }

  function setContent(content, preserveFocus = false) {
    if (state.editor) state.editor.setValue(content);
    else elements.fallback.value = content;
    if (preserveFocus) state.editor?.focus();
  }

  function setDirty(dirty) {
    state.dirty = dirty;
    elements.dirty.hidden = !dirty;
    elements.save.disabled = !state.current || !dirty;
    document.title = `${dirty ? '• ' : ''}Редактор — Docgent`;
  }

  function onEditorChange() {
    if (!state.current) return;
    setDirty(currentContent() !== state.baseline);
    scheduleDiagnostics();
  }

  function createEditor(language, content) {
    state.editor?.destroy?.();
    state.editor = null;
    elements.host.replaceChildren();
    elements.fallback.hidden = true;
    if (window.DocgentCodeMirror) {
      state.editor = window.DocgentCodeMirror.create({ parent: elements.host, doc: content, language, onChange: onEditorChange });
    } else {
      elements.fallback.hidden = false;
      elements.fallback.value = content;
    }
  }

  function renderTree() {
    const query = elements.filter.value.trim().toLocaleLowerCase('ru');
    const filtered = state.files.filter((file) => `${file.path} ${file.title || ''}`.toLocaleLowerCase('ru').includes(query));
    elements.treeList.replaceChildren();
    const groups = new Map();
    filtered.forEach((file) => {
      const parts = file.path.split('/');
      const group = parts.length > 1 ? parts[0] : 'Корень';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(file);
    });
    groups.forEach((files, group) => {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = group;
      const list = document.createElement('ul');
      files.forEach((file) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.filePath = file.path;
        button.className = file.path === state.current?.path ? 'is-active' : '';
        const name = document.createElement('span');
        name.textContent = file.path.split('/').slice(1).join('/') || file.path;
        const meta = document.createElement('small');
        meta.textContent = file.language;
        button.append(name, meta);
        item.append(button);
        list.append(item);
      });
      section.append(heading, list);
      elements.treeList.append(section);
    });
  }

  function showConflict(external) {
    state.external = external;
    const removed = Boolean(external?.removed);
    elements.conflictMessage.textContent = removed
      ? 'Файл удалён с диска. Текст сохранён в редакторе: скачайте его или восстановите файл снаружи.'
      : 'Ваш текст сохранён в редакторе. Сравните версии или подтвердите перезапись.';
    elements.conflictLoad.hidden = removed;
    elements.conflictOverwrite.hidden = removed;
    elements.conflictDownload.hidden = !removed;
    elements.conflict.hidden = false;
  }

  async function loadFiles({ conditional = false } = {}) {
    const headers = conditional && state.etag ? { 'If-None-Match': state.etag } : {};
    const { response, data } = await request(`${API}/files`, { headers });
    if (!data) return false;
    const previousRevision = state.revision;
    state.etag = response.headers.get('ETag') || '';
    state.revision = data.revision;
    state.files = data.files;
    state.templates = data.templates;
    renderTree();
    if (previousRevision && previousRevision !== state.revision && state.current) {
      const fresh = state.files.find((file) => file.path === state.current.path);
      if (!fresh) {
        showConflict({ removed: true });
      } else if (fresh.digest !== state.current.digest) {
        const latest = await fetchFile(state.current.path);
        if (state.dirty) {
          showConflict(latest);
        } else {
          applyFile(latest);
          announce('Файл обновлён внешним процессом.');
        }
      }
    }
    return true;
  }

  async function fetchFile(path) {
    const { data } = await request(`${API}/file?path=${encodeURIComponent(path)}`);
    return data.file;
  }

  function applyFile(file) {
    state.current = file;
    state.baseline = file.content;
    state.external = null;
    elements.conflict.hidden = true;
    elements.path.textContent = file.path;
    elements.raw.hidden = false;
    elements.raw.href = `${API}/file?raw=1&path=${encodeURIComponent(file.path)}`;
    createEditor(file.language, file.content);
    setDirty(false);
    renderDiagnostics(file.diagnostics || []);
    renderTree();
    updatePreviewAvailability();
    if (file.language === 'markdown' && state.view !== 'editor') updatePreview();
  }

  async function openFile(path) {
    if (state.dirty && !window.confirm('Открыть другой файл и потерять несохранённые изменения?')) return;
    try {
      applyFile(await fetchFile(path));
      elements.tree.classList.remove('is-open');
      history.replaceState(null, '', `?path=${encodeURIComponent(path)}`);
    } catch (error) {
      announce(error.message, true);
    }
  }

  function renderDiagnostics(diagnostics) {
    elements.diagnostics.replaceChildren();
    elements.diagnosticCount.textContent = String(diagnostics.length);
    state.editor?.setDiagnostics?.(diagnostics);
    diagnostics.forEach((diagnostic) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `diagnostic-${diagnostic.severity}`;
      button.innerHTML = `<strong></strong><span></span><small></small>`;
      $('strong', button).textContent = diagnostic.code;
      $('span', button).textContent = diagnostic.message;
      $('small', button).textContent = `${diagnostic.path || state.current?.path || ''}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column || 1}` : ''}`;
      button.addEventListener('click', () => {
        if (diagnostic.path && diagnostic.path !== state.current?.path) openFile(diagnostic.path);
        else state.editor?.gotoLine?.(diagnostic.line || 1, diagnostic.column || 1);
      });
      item.append(button);
      elements.diagnostics.append(item);
    });
  }

  let diagnosticTimer;
  function scheduleDiagnostics() {
    window.clearTimeout(diagnosticTimer);
    diagnosticTimer = window.setTimeout(validateCurrent, 320);
  }

  async function validateCurrent() {
    if (!state.current) return;
    try {
      const { data } = await request(`${API}/validate`, actionOptions('validate', { path: state.current.path, content: currentContent() }));
      renderDiagnostics(data.diagnostics || []);
      if (state.current.language === 'markdown' && state.view !== 'editor') updatePreview();
    } catch (error) {
      announce(error.message, true);
    }
  }

  async function updatePreview() {
    if (state.current?.language !== 'markdown') return;
    try {
      const { data } = await request(`${API}/preview`, actionOptions('preview', { path: state.current.path, content: currentContent() }));
      elements.preview.innerHTML = `<article class="preview-document">${data.html}</article>`;
      renderDiagnostics(data.diagnostics || []);
    } catch (error) {
      elements.preview.textContent = error.message;
    }
  }

  async function save({ confirmOverwrite = false, digest = state.current?.digest } = {}) {
    if (!state.current || elements.save.disabled && !confirmOverwrite) return;
    elements.save.disabled = true;
    elements.save.textContent = 'Сохранение…';
    try {
      const { data } = await request(`${API}/file`, actionOptions('save', {
        path: state.current.path, content: currentContent(), expectedDigest: digest, confirmOverwrite,
      }, 'PUT'));
      state.revision = data.revision;
      applyFile(data.file);
      announce('Файл сохранён, портал обновлён.');
      await loadFiles();
    } catch (error) {
      if (error.code === 'stale_digest') {
        showConflict({ ...error.details, path: state.current.path, language: state.current.language });
        announce('Файл изменён снаружи. Ваш текст не потерян.', true);
      } else {
        announce(error.message, true);
      }
      elements.save.disabled = !state.dirty;
    } finally {
      elements.save.textContent = 'Сохранить';
    }
  }

  function setView(view) {
    if (view === 'split' && window.matchMedia('(max-width: 720px)').matches) view = 'editor';
    state.view = view;
    elements.stage.dataset.stage = view;
    document.querySelectorAll('[data-view]').forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.view === view));
    });
    if (view !== 'editor') updatePreview();
  }

  function updatePreviewAvailability() {
    document.querySelectorAll('[data-view="preview"], [data-view="split"]').forEach((tab) => {
      tab.disabled = state.current?.language !== 'markdown';
    });
    if (state.current?.language !== 'markdown' && state.view !== 'editor') setView('editor');
  }

  function renderTemplateForm() {
    const template = state.templates.find((item) => item.key === elements.template.value);
    if (!template) return;
    elements.language.replaceChildren();
    template.languages.forEach((language) => elements.language.add(new Option(language.toUpperCase(), language)));
    elements.fields.replaceChildren();
    template.fields.forEach((field) => {
      const label = document.createElement('label');
      label.textContent = field.label;
      let input;
      if (field.type === 'select') {
        input = document.createElement('select');
        field.options.forEach((option) => input.add(new Option(option, option)));
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.name = field.name;
      input.required = field.required;
      label.append(input);
      elements.fields.append(label);
    });
  }

  async function createDocument(event) {
    if (event.submitter?.value === 'cancel') return;
    event.preventDefault();
    const fields = {};
    new FormData(elements.form).forEach((value, key) => { fields[key] = String(value); });
    try {
      const { data } = await request(`${API}/create`, actionOptions('create', {
        template: elements.template.value, language: elements.language.value, fields,
      }));
      elements.dialog.close();
      state.revision = data.revision;
      await loadFiles();
      applyFile(data.file);
      announce('Документ создан.');
    } catch (error) {
      elements.createError.textContent = error.message;
    }
  }

  elements.treeList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-file-path]');
    if (button) openFile(button.dataset.filePath);
  });
  elements.filter.addEventListener('input', renderTree);
  elements.fallback.addEventListener('input', onEditorChange);
  elements.save.addEventListener('click', () => save());
  $('[data-tree-toggle]').addEventListener('click', () => elements.tree.classList.add('is-open'));
  $('[data-tree-close]').addEventListener('click', () => elements.tree.classList.remove('is-open'));
  const viewTabs = [...document.querySelectorAll('[data-view]')];
  viewTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setView(tab.dataset.view));
    tab.addEventListener('keydown', (event) => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % viewTabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + viewTabs.length) % viewTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = viewTabs.length - 1;
      else return;
      while (viewTabs[next].disabled && next !== index) next = (next + (event.key === 'ArrowLeft' ? -1 : 1) + viewTabs.length) % viewTabs.length;
      event.preventDefault();
      viewTabs[next].focus();
      setView(viewTabs[next].dataset.view);
    });
  });
  elements.conflictLoad.addEventListener('click', () => {
    if (!state.external || state.external.removed) return;
    if (state.dirty && !window.confirm('Загрузить внешнюю версию и потерять несохранённые изменения?')) return;
    applyFile({ ...state.current, ...state.external, diagnostics: [] });
    announce('Загружена внешняя версия.');
  });
  elements.conflictOverwrite.addEventListener('click', () => {
    if (state.external?.digest) save({ confirmOverwrite: true, digest: state.external.digest });
  });
  elements.conflictDownload.addEventListener('click', () => {
    if (!state.current) return;
    const url = URL.createObjectURL(new Blob([currentContent()], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${state.current.path.split('/').pop()}.unsaved`;
    link.click();
    URL.revokeObjectURL(url);
    announce('Несохранённый текст скачан.');
  });
  $('[data-create-open]').addEventListener('click', () => {
    elements.template.replaceChildren();
    state.templates.forEach((template) => elements.template.add(new Option(template.label, template.key)));
    renderTemplateForm();
    elements.createError.textContent = '';
    elements.dialog.showModal();
  });
  elements.template.addEventListener('change', renderTemplateForm);
  elements.form.addEventListener('submit', createDocument);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.matchMedia('(max-width: 720px)').addEventListener('change', (event) => {
    if (event.matches && state.view === 'split') setView('editor');
  });

  (async () => {
    try {
      await loadFiles();
      const requested = new URLSearchParams(location.search).get('path');
      const first = state.files.find((file) => file.path === requested) || state.files[0];
      if (first) await openFile(first.path);
      window.setInterval(() => loadFiles({ conditional: true }).catch(() => {}), 2000);
    } catch (error) {
      announce(error.message, true);
    }
  })();
})();
