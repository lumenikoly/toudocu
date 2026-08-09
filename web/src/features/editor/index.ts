import { registerMessages, text } from "../../core/locale";
import { editorMessages } from "../../core/messages.ru";
import { closeDialogOnEscape } from "../../components";
import { diagnosticsForEditor, editorResponseIsCurrent } from "./state";
registerMessages(editorMessages);
(() => {
    'use strict';
    const page: any = window.DocuDocuPage;
    const API: any = page?.runtime === 'serve' && page.capabilities?.editor ? page.endpoints?.editor : '';
    const $: any = (selector: any, root: any = document) => root.querySelector(selector);
    const state: any = {
        files: [], templates: [], revision: '', etag: '', current: null,
        baseline: '', dirty: false, external: null, view: 'editor', editor: null,
    };
    let validationGeneration = 0;
    let previewGeneration = 0;
    const elements: any = {
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
    if (!API) {
        elements.host.textContent = text("features.editor.index.001");
        elements.host.dataset.uiState = 'capability-unavailable';
        return;
    }
    closeDialogOnEscape(elements.dialog);
    async function request(url: any, options: any = {}) {
        const response: any = await fetch(url, { cache: 'no-store', ...options });
        if (response.status === 304)
            return { response, data: null };
        const data: any = await response.json().catch(() => null);
        if (!response.ok) {
            const error: any = new Error(data?.error?.message || `HTTP ${response.status}`);
            error.code = data?.error?.code;
            error.details = data?.error?.details;
            error.status = response.status;
            throw error;
        }
        return { response, data };
    }
    function actionOptions(action: any, body: any, method: any = 'POST') {
        return {
            method,
            headers: { 'Content-Type': 'application/json', 'X-Docu-docu-Action': action, Accept: 'application/json' },
            body: JSON.stringify(body),
        };
    }
    function announce(message: any, error: any = false) {
        elements.toast.textContent = message;
        elements.toast.classList.toggle('is-error', error);
        elements.toast.classList.add('is-visible');
        window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
    }
    function currentContent() {
        return state.editor ? state.editor.getValue() : elements.fallback.value;
    }
    function setContent(content: any, preserveFocus: any = false) {
        if (state.editor)
            state.editor.setValue(content);
        else
            elements.fallback.value = content;
        if (preserveFocus)
            state.editor?.focus();
    }
    function setDirty(dirty: any) {
        state.dirty = dirty;
        elements.dirty.hidden = !dirty;
        elements.save.disabled = !state.current || !dirty;
        document.title = text("features.editor.index.002", [dirty ? '• ' : '']);
    }
    function onEditorChange() {
        if (!state.current)
            return;
        setDirty(currentContent() !== state.baseline);
        scheduleDiagnostics();
    }
    function createEditor(language: any, content: any) {
        state.editor?.destroy?.();
        state.editor = null;
        elements.host.replaceChildren();
        elements.fallback.hidden = true;
        if (window.DocuDocuCodeMirror) {
            state.editor = window.DocuDocuCodeMirror.create({ parent: elements.host, doc: content, language, onChange: onEditorChange });
        }
        else {
            elements.fallback.hidden = false;
            elements.fallback.value = content;
        }
    }
    document.addEventListener('docu-docu:themechange', (event: any) => {
        state.editor?.setTheme?.(event.detail.theme);
    });
    function renderTree() {
        const query: any = elements.filter.value.trim().toLocaleLowerCase('ru');
        const filtered: any = state.files.filter((file: any) => `${file.path} ${file.title || ''}`.toLocaleLowerCase('ru').includes(query));
        elements.treeList.replaceChildren();
        const groups: any = new Map();
        filtered.forEach((file: any) => {
            const parts: any = file.path.split('/');
            const group: any = parts.length > 1 ? parts[0] : text("features.editor.index.003");
            if (!groups.has(group))
                groups.set(group, []);
            groups.get(group).push(file);
        });
        groups.forEach((files: any, group: any) => {
            const section: any = document.createElement('section');
            const heading: any = document.createElement('h2');
            heading.textContent = group;
            const list: any = document.createElement('ul');
            files.forEach((file: any) => {
                const item: any = document.createElement('li');
                const button: any = document.createElement('button');
                button.type = 'button';
                button.dataset.filePath = file.path;
                button.className = file.path === state.current?.path ? 'is-active' : '';
                const name: any = document.createElement('span');
                name.textContent = file.path.split('/').slice(1).join('/') || file.path;
                const meta: any = document.createElement('small');
                meta.textContent = file.language;
                button.append(name, meta);
                item.append(button);
                list.append(item);
            });
            section.append(heading, list);
            elements.treeList.append(section);
        });
    }
    function showConflict(external: any) {
        state.external = external;
        const removed: any = Boolean(external?.removed);
        elements.conflictMessage.textContent = removed
            ? text("features.editor.index.004") : text("features.editor.index.005");
        elements.conflictLoad.hidden = removed;
        elements.conflictOverwrite.hidden = removed;
        elements.conflictDownload.hidden = !removed;
        elements.conflict.hidden = false;
    }
    async function loadFiles({ conditional = false }: any = {}) {
        const headers: any = conditional && state.etag ? { 'If-None-Match': state.etag } : {};
        const { response, data }: any = await request(`${API}/files`, { headers });
        if (!data)
            return false;
        const previousRevision: any = state.revision;
        state.etag = response.headers.get('ETag') || '';
        state.revision = data.revision;
        state.files = data.files;
        state.templates = data.templates;
        renderTree();
        if (previousRevision && previousRevision !== state.revision && state.current) {
            const fresh: any = state.files.find((file: any) => file.path === state.current.path);
            if (!fresh) {
                showConflict({ removed: true });
            }
            else if (fresh.digest !== state.current.digest) {
                const latest: any = await fetchFile(state.current.path);
                if (state.dirty) {
                    showConflict(latest);
                }
                else {
                    applyFile(latest);
                    announce(text("features.editor.index.006"));
                }
            }
        }
        return true;
    }
    async function fetchFile(path: any) {
        const { data }: any = await request(`${API}/file?path=${encodeURIComponent(path)}`);
        return data.file;
    }
    function applyFile(file: any) {
        validationGeneration++;
        previewGeneration++;
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
        if (file.language === 'markdown' && state.view !== 'editor')
            updatePreview();
    }
    async function openFile(path: any) {
        if (state.dirty && !window.confirm(text("features.editor.index.007")))
            return;
        try {
            applyFile(await fetchFile(path));
            elements.tree.classList.remove('is-open');
            history.replaceState(null, '', `?path=${encodeURIComponent(path)}`);
        }
        catch (error: any) {
            announce(error.message, true);
        }
    }
    function renderDiagnostics(diagnostics: any) {
        elements.diagnostics.replaceChildren();
        elements.diagnosticCount.textContent = String(diagnostics.length);
        state.editor?.setDiagnostics?.(diagnosticsForEditor(diagnostics, state.current?.path || ''));
        diagnostics.forEach((diagnostic: any) => {
            const item: any = document.createElement('li');
            const button: any = document.createElement('button');
            button.type = 'button';
            button.className = `diagnostic-${diagnostic.severity}`;
            button.innerHTML = `<strong></strong><span></span><small></small>`;
            $('strong', button).textContent = diagnostic.code;
            $('span', button).textContent = diagnostic.message;
            $('small', button).textContent = `${diagnostic.path || state.current?.path || ''}${diagnostic.line ? `:${diagnostic.line}:${diagnostic.column || 1}` : ''}`;
            button.addEventListener('click', () => {
                if (diagnostic.path && diagnostic.path !== state.current?.path)
                    openFile(diagnostic.path);
                else
                    state.editor?.gotoLine?.(diagnostic.line || 1, diagnostic.column || 1);
            });
            item.append(button);
            elements.diagnostics.append(item);
        });
    }
    let diagnosticTimer: any;
    function scheduleDiagnostics() {
        window.clearTimeout(diagnosticTimer);
        diagnosticTimer = window.setTimeout(validateCurrent, 320);
    }
    async function validateCurrent() {
        if (!state.current)
            return;
        const requestPath: any = state.current.path;
        const requestGeneration: any = ++validationGeneration;
        const content: any = currentContent();
        try {
            const { data }: any = await request(`${API}/validate`, actionOptions('validate', { path: requestPath, content }));
            if (!editorResponseIsCurrent(requestPath, state.current?.path || '', requestGeneration, validationGeneration))
                return;
            renderDiagnostics(data.diagnostics || []);
            if (state.current.language === 'markdown' && state.view !== 'editor')
                updatePreview();
        }
        catch (error: any) {
            if (!editorResponseIsCurrent(requestPath, state.current?.path || '', requestGeneration, validationGeneration))
                return;
            announce(error.message, true);
        }
    }
    async function updatePreview() {
        if (state.current?.language !== 'markdown')
            return;
        const requestPath: any = state.current.path;
        const requestGeneration: any = ++previewGeneration;
        const content: any = currentContent();
        try {
            const { data }: any = await request(`${API}/preview`, actionOptions('preview', { path: requestPath, content }));
            if (!editorResponseIsCurrent(requestPath, state.current?.path || '', requestGeneration, previewGeneration))
                return;
            elements.preview.innerHTML = `<article class="preview-document">${data.html}</article>`;
            renderDiagnostics(data.diagnostics || []);
        }
        catch (error: any) {
            if (!editorResponseIsCurrent(requestPath, state.current?.path || '', requestGeneration, previewGeneration))
                return;
            elements.preview.textContent = error.message;
        }
    }
    async function save({ confirmOverwrite = false, digest = state.current?.digest }: any = {}) {
        if (!state.current || elements.save.disabled && !confirmOverwrite)
            return;
        elements.save.disabled = true;
        elements.save.textContent = text("features.editor.index.008");
        try {
            const { data }: any = await request(`${API}/file`, actionOptions('save', {
                path: state.current.path, content: currentContent(), expectedDigest: digest, confirmOverwrite,
            }, 'PUT'));
            state.revision = data.revision;
            applyFile(data.file);
            announce(text("features.editor.index.009"));
            await loadFiles();
        }
        catch (error: any) {
            if (error.code === 'stale_digest') {
                showConflict({ ...error.details, path: state.current.path, language: state.current.language });
                announce(text("features.editor.index.010"), true);
            }
            else {
                announce(error.message, true);
            }
            elements.save.disabled = !state.dirty;
        }
        finally {
            elements.save.textContent = text("features.editor.index.011");
        }
    }
    function setView(view: any) {
        if (view === 'split' && window.matchMedia('(max-width: 720px)').matches)
            view = 'editor';
        state.view = view;
        elements.stage.dataset.stage = view;
        document.querySelectorAll('[data-view]').forEach((tab: any) => {
            tab.setAttribute('aria-selected', String(tab.dataset.view === view));
        });
        if (view !== 'editor')
            updatePreview();
    }
    function updatePreviewAvailability() {
        document.querySelectorAll('[data-view="preview"], [data-view="split"]').forEach((tab: any) => {
            tab.disabled = state.current?.language !== 'markdown';
        });
        if (state.current?.language !== 'markdown' && state.view !== 'editor')
            setView('editor');
    }
    function renderTemplateForm() {
        const template: any = state.templates.find((item: any) => item.key === elements.template.value);
        if (!template)
            return;
        elements.language.replaceChildren();
        template.languages.forEach((language: any) => elements.language.add(new Option(language.toUpperCase(), language)));
        elements.fields.replaceChildren();
        template.fields.forEach((field: any) => {
            const label: any = document.createElement('label');
            label.textContent = field.label;
            let input: any;
            if (field.type === 'select') {
                input = document.createElement('select');
                field.options.forEach((option: any) => input.add(new Option(option, option)));
            }
            else {
                input = document.createElement('input');
                input.type = 'text';
            }
            input.name = field.name;
            input.required = field.required;
            label.append(input);
            elements.fields.append(label);
        });
    }
    async function createDocument(event: any) {
        if (event.submitter?.value === 'cancel')
            return;
        event.preventDefault();
        const fields: any = {};
        new FormData(elements.form).forEach((value: any, key: any) => { fields[key] = String(value); });
        try {
            const { data }: any = await request(`${API}/create`, actionOptions('create', {
                template: elements.template.value, language: elements.language.value, fields,
            }));
            elements.dialog.close();
            state.revision = data.revision;
            await loadFiles();
            applyFile(data.file);
            announce(text("features.editor.index.012"));
        }
        catch (error: any) {
            elements.createError.textContent = error.message;
        }
    }
    elements.treeList.addEventListener('click', (event: any) => {
        const button: any = event.target.closest('[data-file-path]');
        if (button)
            openFile(button.dataset.filePath);
    });
    elements.filter.addEventListener('input', renderTree);
    elements.fallback.addEventListener('input', onEditorChange);
    elements.save.addEventListener('click', () => save());
    $('[data-tree-toggle]').addEventListener('click', () => elements.tree.classList.add('is-open'));
    $('[data-tree-close]').addEventListener('click', () => elements.tree.classList.remove('is-open'));
    const viewTabs: any = [...document.querySelectorAll('[data-view]')];
    viewTabs.forEach((tab: any, index: any) => {
        tab.addEventListener('click', () => setView(tab.dataset.view));
        tab.addEventListener('keydown', (event: any) => {
            let next: any = index;
            if (event.key === 'ArrowRight')
                next = (index + 1) % viewTabs.length;
            else if (event.key === 'ArrowLeft')
                next = (index - 1 + viewTabs.length) % viewTabs.length;
            else if (event.key === 'Home')
                next = 0;
            else if (event.key === 'End')
                next = viewTabs.length - 1;
            else
                return;
            while (viewTabs[next].disabled && next !== index)
                next = (next + (event.key === 'ArrowLeft' ? -1 : 1) + viewTabs.length) % viewTabs.length;
            event.preventDefault();
            viewTabs[next].focus();
            setView(viewTabs[next].dataset.view);
        });
    });
    elements.conflictLoad.addEventListener('click', () => {
        if (!state.external || state.external.removed)
            return;
        if (state.dirty && !window.confirm(text("features.editor.index.013")))
            return;
        applyFile({ ...state.current, ...state.external, diagnostics: [] });
        announce(text("features.editor.index.014"));
    });
    elements.conflictOverwrite.addEventListener('click', () => {
        if (state.external?.digest)
            save({ confirmOverwrite: true, digest: state.external.digest });
    });
    elements.conflictDownload.addEventListener('click', () => {
        if (!state.current)
            return;
        const url: any = URL.createObjectURL(new Blob([currentContent()], { type: 'text/plain;charset=utf-8' }));
        const link: any = document.createElement('a');
        link.href = url;
        link.download = `${state.current.path.split('/').pop()}.unsaved`;
        link.click();
        URL.revokeObjectURL(url);
        announce(text("features.editor.index.015"));
    });
    $('[data-create-open]').addEventListener('click', () => {
        elements.template.replaceChildren();
        state.templates.forEach((template: any) => elements.template.add(new Option(template.label, template.key)));
        renderTemplateForm();
        elements.createError.textContent = '';
        elements.dialog.showModal();
    });
    elements.template.addEventListener('change', renderTemplateForm);
    elements.form.addEventListener('submit', createDocument);
    document.addEventListener('keydown', (event: any) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 's') {
            event.preventDefault();
            save();
        }
    });
    window.addEventListener('beforeunload', (event: any) => {
        if (!state.dirty)
            return;
        event.preventDefault();
        event.returnValue = '';
    });
    window.matchMedia('(max-width: 720px)').addEventListener('change', (event: any) => {
        if (event.matches && state.view === 'split')
            setView('editor');
    });
    (async () => {
        try {
            await loadFiles();
            const requested: any = new URLSearchParams(location.search).get('path');
            const first: any = state.files.find((file: any) => file.path === requested) || state.files[0];
            if (first)
                await openFile(first.path);
            window.setInterval(() => loadFiles({ conditional: true }).catch(() => { }), 2000);
        }
        catch (error: any) {
            announce(error.message, true);
        }
    })();
})();
