import { registerMessages, text } from "../../core/locale";
import { changesMessages } from "../../core/messages.ru";
registerMessages(changesMessages);
(() => {
    'use strict';
    const page: any = window.DocuDocuPage;
    const API: any = page?.runtime === 'serve' && page.capabilities?.changes ? page.endpoints?.changes : '';
    const EDITOR_WORKSPACE: any = page?.runtime === 'serve' && page.capabilities?.editor ? page.endpoints?.editorWorkspace : '';
    const $: any = (selector: any, root: any = document) => root.querySelector(selector);
    const state: any = { report: null, selected: null, tab: 'summary', merge: null, etag: '' };
    const elements: any = {
        base: $('[data-base]'), branchBase: $('[data-branch-base]'), target: $('[data-target]'), targetRevision: $('[data-target-revision]'), targetRevisionWrap: $('[data-target-revision-wrap]'), apply: $('[data-apply-range]'), range: $('[data-range-summary]'),
        summary: $('[data-summary]'), stale: $('[data-stale]'), search: $('[data-search]'), status: $('[data-status]'),
        classification: $('[data-classification]'), gitState: $('[data-git-state]'), list: $('[data-file-list]'),
        count: $('[data-result-count]'), detail: $('[data-detail]'), toast: $('[data-changes-toast]'),
    };
    if (!API) {
        elements.detail.innerHTML = text("features.changes.index.001");
        return;
    }
    document.addEventListener('docu-docu:themechange', async (event: any) => {
        state.merge?.setTheme?.(event.detail.theme);
        if (state.selected && (state.tab === 'mermaid' || state.tab === 'rendered'))
            await renderDetail();
    });
    function addToolbarControl(label: any, name: any, options: any, input: any = false) {
        const wrapper: any = document.createElement('label');
        const caption: any = document.createElement('span');
        caption.textContent = label;
        const control: any = document.createElement(input ? 'input' : 'select');
        control.dataset[name] = '';
        if (input)
            control.placeholder = options;
        else
            options.forEach(([value, text]: any) => control.add(new Option(text, value)));
        wrapper.append(caption, control);
        $('.changes-toolbar').append(wrapper);
        elements[name] = control;
        return control;
    }
    const escapeHTML: any = (value: any) => String(value ?? '').replace(/[&<>"']/g, (character: any) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[character]);
    const statusLabel: any = (status: any) => ({ added: text("features.changes.index.002"), untracked: 'Untracked', modified: text("features.changes.index.003"), deleted: text("features.changes.index.004"), renamed: text("features.changes.index.005"), copied: text("features.changes.index.006"), 'type-changed': text("features.changes.index.007") } as Record<string, string>)[status] || status;
    const selectedTarget: any = () => elements.target.value === 'revision' ? elements.targetRevision.value.trim() : elements.target.value;
    const query: any = () => {
        const params: any = new URLSearchParams();
        if (elements.base.value.trim() && elements.base.value.trim() !== 'HEAD')
            params.set('base', elements.base.value.trim());
        if (elements.branchBase.value.trim())
            params.set('branchBase', elements.branchBase.value.trim());
        const target: any = selectedTarget();
        if (target && target !== 'working-tree')
            params.set('target', target);
        return params;
    };
    const apiURL: any = (endpoint: any = '', extra: any = {}) => { const params: any = query(); Object.entries(extra).forEach(([key, value]: any) => value != null && params.set(key, value)); return `${API}${endpoint}?${params}`; };
    const languageFor: any = (path: any) => path.endsWith('.json') ? 'json' : /\.ya?ml$/i.test(path) ? 'yaml' : 'markdown';
    const changeText: any = (change: any) => [change.path, change.oldPath, ...change.entitiesBefore.map((item: any) => `${item.id} ${item.title}`), ...change.entitiesAfter.map((item: any) => `${item.id} ${item.title}`), ...change.semanticChanges.map((item: any) => item.summary)].join(' ').toLocaleLowerCase('ru');
    function updateURL() {
        const params: any = query();
        if (state.selected)
            params.set('path', state.selected.path);
        if (state.tab !== 'summary')
            params.set('tab', state.tab);
        if (elements.search.value)
            params.set('q', elements.search.value);
        if (elements.status.value)
            params.set('status', elements.status.value);
        if (elements.classification.value)
            params.set('classification', elements.classification.value);
        if (elements.gitState.value)
            params.set('gitState', elements.gitState.value);
        if (elements.entityType.value)
            params.set('type', elements.entityType.value);
        if (elements.module.value)
            params.set('module', elements.module.value);
        if (elements.task.value)
            params.set('task', elements.task.value);
        if (elements.sort.value !== 'path')
            params.set('sort', elements.sort.value);
        if (elements.group.value !== 'classification')
            params.set('group', elements.group.value);
        history.replaceState(null, '', `${location.pathname}?${params}`);
    }
    function renderSummary() {
        const { report }: any = state;
        const summary: any = report.summary;
        elements.range.textContent = `Base: ${report.comparison.base.displayRef} — ${report.comparison.base.resolved.slice(0, 7)} · Target: ${report.comparison.target.displayRef}${report.comparison.target.resolved ? ` — ${report.comparison.target.resolved.slice(0, 7)}` : ''} · Branch: ${report.repository.branch || 'detached HEAD'} · State: ${report.repository.dirty ? 'dirty' : 'clean'}`;
        const metrics: any = [[text("features.changes.index.008"), summary.files.added + summary.files.untracked], [text("features.changes.index.009"), summary.files.modified], [text("features.changes.index.010"), summary.files.deleted], [text("features.changes.index.011"), summary.files.renamed], [text("features.changes.index.012"), `+${summary.lines.added} −${summary.lines.deleted}`]];
        elements.summary.innerHTML = metrics.map(([label, value]: any) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
    }
    function matches(change: any) {
        const search: any = elements.search.value.trim().toLocaleLowerCase('ru');
        if (search && !changeText(change).includes(search))
            return false;
        if (elements.status.value && change.status !== elements.status.value)
            return false;
        if (elements.classification.value && change.classification !== elements.classification.value)
            return false;
        const git: any = elements.gitState.value;
        if (git && !change.gitState[git])
            return false;
        if (elements.entityType.value && ![...change.entitiesBefore, ...change.entitiesAfter].some((item: any) => item.type === elements.entityType.value))
            return false;
        if (elements.module.value && !changeText(change).includes(elements.module.value.toLocaleLowerCase('ru')))
            return false;
        if (elements.task.value && !changeText(change).includes(elements.task.value.toLocaleLowerCase('ru')))
            return false;
        return true;
    }
    function renderList() {
        const changes: any = state.report.changes.filter(matches).sort((left: any, right: any) => {
            if (elements.sort.value === 'status')
                return left.status.localeCompare(right.status) || left.path.localeCompare(right.path);
            if (elements.sort.value === 'changes')
                return (right.lines.added + right.lines.deleted) - (left.lines.added + left.lines.deleted) || left.path.localeCompare(right.path);
            if (elements.sort.value === 'type')
                return (left.entitiesAfter[0]?.type || left.entitiesBefore[0]?.type || '').localeCompare(right.entitiesAfter[0]?.type || right.entitiesBefore[0]?.type || '') || left.path.localeCompare(right.path);
            if (elements.sort.value === 'module')
                return changeModule(left).localeCompare(changeModule(right)) || left.path.localeCompare(right.path);
            if (elements.sort.value === 'id')
                return changeID(left).localeCompare(changeID(right)) || left.path.localeCompare(right.path);
            return left.path.localeCompare(right.path);
        });
        elements.count.textContent = text("features.changes.index.013", [changes.length, state.report.changes.length]);
        elements.list.replaceChildren();
        const groupKey: any = (change: any) => {
            if (elements.group.value === 'status')
                return change.status;
            if (elements.group.value === 'type')
                return change.entitiesAfter[0]?.type || change.entitiesBefore[0]?.type || 'unknown';
            if (elements.group.value === 'module')
                return changeModule(change) || text("features.changes.index.014");
            if (elements.group.value === 'task')
                return changeTask(change) || text("features.changes.index.015");
            if (elements.group.value === 'directory')
                return change.path.split('/').slice(0, -1).join('/') || '/';
            if (elements.group.value === 'none')
                return '';
            return change.classification;
        };
        const labels: any = { 'permanent-documentation': text("features.changes.index.016"), contract: text("features.changes.index.017"), asset: 'Assets', 'work-artifact': text("features.changes.index.018") };
        [...new Set(changes.map(groupKey))].forEach((key: any) => {
            const items: any = changes.filter((change: any) => groupKey(change) === key);
            if (!items.length)
                return;
            const label: any = labels[key] || key || text("features.changes.index.019");
            const heading: any = document.createElement('h3');
            heading.textContent = label;
            elements.list.append(heading);
            items.forEach((change: any) => {
                const button: any = document.createElement('button');
                button.type = 'button';
                button.className = `changes-file ${state.selected?.path === change.path ? 'is-active' : ''}`;
                button.dataset.path = change.path;
                const entity: any = change.entitiesAfter[0] || change.entitiesBefore[0];
                button.innerHTML = `<span class="changes-file-status status-${escapeHTML(change.status)}">${escapeHTML(statusLabel(change.status))}</span><strong>${escapeHTML(entity?.id || change.path.split('/').pop())}</strong><span class="changes-file-title">${escapeHTML(entity?.title || '')}</span><span class="changes-file-path">${escapeHTML(change.oldPath ? `${change.oldPath} → ${change.path}` : change.path)}</span><span class="changes-line-stats">+${change.lines.added} −${change.lines.deleted}</span>`;
                button.addEventListener('click', () => selectChange(change));
                elements.list.append(button);
            });
        });
        if (!changes.length)
            elements.list.innerHTML = text("features.changes.index.020");
    }
    const changeID: any = (change: any) => change.entitiesAfter[0]?.id || change.entitiesBefore[0]?.id || '';
    const changeModule: any = (change: any) => change.semanticChanges.find((item: any) => item.field === 'module')?.after || change.semanticChanges.find((item: any) => item.field === 'module')?.before || '';
    const changeTask: any = (change: any) => (changeText(change).match(/TASK-[A-Z0-9-]+/) || [])[0] || '';
    const tabsFor: any = (change: any) => [['summary', text("features.changes.index.021")], ['source', text("features.changes.index.022")], ...(change.renderedDiffAvailable ? [['rendered', text("features.changes.index.023")]] : []), ...(change.semanticDiffAvailable ? [['semantic', text("features.changes.index.024")]] : []), ['relations', text("features.changes.index.025")], ...(change.classification === 'contract' ? [['openapi', 'OpenAPI']] : []), ...(change.mermaidBlocks?.length ? [['mermaid', 'Mermaid']] : []), ...(change.classification === 'asset' ? [['assets', 'Assets']] : []), ...([...(change.entitiesBefore || []), ...(change.entitiesAfter || [])].some((item: any) => item.type === 'screen' || item.type === 'transition') ? [['map', text("features.changes.index.026")]] : [])];
    async function selectChange(change: any, tab: any = state.tab) {
        if (change.sourceDiffAvailable && !change.sourceDiff) {
            try {
                const response: any = await fetch(apiURL('/file', { path: change.path }), { cache: 'no-store' });
                if (response.ok)
                    change = await response.json();
            }
            catch { /* summary remains usable */ }
        }
        state.selected = change;
        state.tab = tabsFor(change).some(([id]: any) => id === tab) ? tab : 'summary';
        state.merge?.destroy?.();
        state.merge = null;
        renderList();
        updateURL();
        await renderDetail();
    }
    function detailHeader(change: any) {
        const entity: any = change.entitiesAfter[0] || change.entitiesBefore[0];
        const editorLink: any = EDITOR_WORKSPACE ? text("features.changes.index.027", [escapeHTML(EDITOR_WORKSPACE), encodeURIComponent(change.path.replace(/^docs\//, ''))]) : '';
        return text("features.changes.index.028", [escapeHTML(change.status), escapeHTML(statusLabel(change.status)), escapeHTML(entity?.id || change.path.split('/').pop()), entity?.title ? ` — ${escapeHTML(entity.title)}` : '', escapeHTML(change.oldPath ? `${change.oldPath} → ${change.path}` : change.path), change.lines.added, change.lines.deleted, editorLink, tabsFor(change).map(([id, label]: any) => `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${label}</button>`).join('')]);
    }
    async function renderDetail() {
        const change: any = state.selected;
        if (!change)
            return;
        elements.detail.innerHTML = detailHeader(change);
        elements.detail.querySelectorAll('[data-tab]').forEach((button: any) => button.addEventListener('click', () => selectChange(change, button.dataset.tab)));
        const panel: any = $('[data-tab-panel]', elements.detail);
        if (state.tab === 'summary')
            renderChangeSummary(panel, change);
        if (state.tab === 'source')
            await renderSource(panel, change);
        if (state.tab === 'rendered')
            await renderBeforeAfter(panel, change);
        if (state.tab === 'semantic')
            renderSemantic(panel, change);
        if (state.tab === 'relations')
            renderRelations(panel, change);
        if (state.tab === 'openapi')
            renderSemantic(panel, change);
        if (state.tab === 'mermaid')
            await renderMermaid(panel, change);
        if (state.tab === 'assets')
            renderAssets(panel, change);
        if (state.tab === 'map')
            renderMap(panel, change);
    }
    function renderChangeSummary(panel: any, change: any) {
        const semantic: any = change.semanticChanges.slice(0, 8);
        panel.innerHTML = text("features.changes.index.029", [semantic.length ? `<ul>${semantic.map((item: any) => `<li>${escapeHTML(item.summary)}${item.compatibility ? ` <span class="compatibility ${item.compatibility}">${escapeHTML(item.compatibility)}</span>` : ''}</li>`).join('')}</ul>` : text("features.changes.index.073"), ['staged', 'unstaged', 'untracked', 'committedInBranch'].filter((key: any) => change.gitState[key]).join(', ') || 'committed comparison', change.oldSize, change.newSize, change.sourceDiffAvailable ? text("features.changes.index.074") : text("features.changes.index.075"), change.renderedDiffAvailable ? text("features.changes.index.076") : text("features.changes.index.077"), change.semanticDiffAvailable ? text("features.changes.index.078") : text("features.changes.index.079"), change.diagnostics.length ? `<h3>Diagnostics</h3><ul>${change.diagnostics.map((item: any) => `<li><code>${escapeHTML(item.code)}</code> ${escapeHTML(item.message)}</li>`).join('')}</ul>` : '']);
    }
    async function fetchSide(change: any, side: any, render: any = false) {
        const response: any = await fetch(apiURL(render ? '/render' : '/content', { side, path: change.path }), { cache: 'no-store' });
        if (response.status === 204)
            return '';
        if (!response.ok)
            throw new Error(`HTTP ${response.status}`);
        return response.text();
    }
    async function renderSource(panel: any, change: any) {
        panel.innerHTML = text("features.changes.index.030", [change.sourceDiffHunks?.length > 1 ? text("features.changes.index.080") : '']);
        const host: any = $('[data-source-view]', panel);
        let activeHunk: any = 0;
        const renderHunkLine: any = (line: any, counters: any) => {
            let oldLine: any = '', newLine: any = '';
            const marker: any = line[0] || ' ';
            if (marker === ' ') {
                oldLine = counters.old++;
                newLine = counters.new++;
            }
            if (marker === '-')
                oldLine = counters.old++;
            if (marker === '+')
                newLine = counters.new++;
            return `<span class="diff-line diff-line-${marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context'}"><span class="diff-line-number">${oldLine}</span><span class="diff-line-number">${newLine}</span><span class="diff-line-marker">${escapeHTML(marker)}</span><span class="diff-line-content">${escapeHTML(line.slice(1))}</span></span>`;
        };
        const focusHunk: any = (index: any) => {
            const hunks: any = [...host.querySelectorAll('.changes-hunk')];
            if (!hunks.length)
                return;
            activeHunk = (index + hunks.length) % hunks.length;
            hunks[activeHunk].scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            hunks[activeHunk].focus();
            location.hash = hunks[activeHunk].id;
        };
        const showUnified: any = () => {
            state.merge?.destroy?.();
            state.merge = null;
            host.replaceChildren();
            if (!change.sourceDiffHunks?.length) {
                const pre: any = document.createElement('pre');
                pre.className = 'changes-diff';
                pre.textContent = change.sourceDiff || text("features.changes.index.031");
                host.append(pre);
                return;
            }
            change.sourceDiffHunks.forEach((hunk: any, index: any) => {
                const article: any = document.createElement('article');
                article.className = 'changes-hunk';
                article.id = hunk.id;
                article.tabIndex = -1;
                const lines: any = hunk.patch.split('\n');
                const header: any = lines.shift();
                if (lines.at(-1) === '')
                    lines.pop();
                const counters: any = { old: hunk.oldStart, new: hunk.newStart };
                article.innerHTML = text("features.changes.index.032", [escapeHTML(hunk.id), index + 1, escapeHTML(header), hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines, lines.map((line: any) => renderHunkLine(line, counters)).join('')]);
                article.querySelector('a').addEventListener('click', (event: any) => { event.preventDefault(); activeHunk = index; history.replaceState(null, '', `${location.pathname}${location.search}#${hunk.id}`); article.focus(); });
                article.querySelector('[data-copy-hunk]').addEventListener('click', async () => { await navigator.clipboard.writeText(hunk.patch); announce(text("features.changes.index.033")); });
                host.append(article);
            });
            const requested: any = decodeURIComponent(location.hash.slice(1));
            const requestedIndex: any = change.sourceDiffHunks.findIndex((hunk: any) => hunk.id === requested);
            if (requestedIndex >= 0)
                requestAnimationFrame(() => focusHunk(requestedIndex));
        };
        const showMerge: any = async () => {
            host.innerHTML = text("features.changes.index.034");
            try {
                const [before, after]: any = await Promise.all([fetchSide(change, 'before'), fetchSide(change, 'after')]);
                host.replaceChildren();
                if (window.DocuDocuCodeMirror?.createMerge)
                    state.merge = window.DocuDocuCodeMirror.createMerge({ parent: host, before, after, language: languageFor(change.path) });
                else {
                    host.innerHTML = `<div class="source-columns"><pre>${escapeHTML(before)}</pre><pre>${escapeHTML(after)}</pre></div>`;
                }
            }
            catch (error: any) {
                host.innerHTML = text("features.changes.index.035", [escapeHTML(error.message)]);
            }
        };
        panel.querySelector('[data-source-mode="unified"]').addEventListener('click', showUnified);
        panel.querySelector('[data-source-mode="merge"]').addEventListener('click', showMerge);
        panel.querySelector('[data-hunk-previous]')?.addEventListener('click', () => focusHunk(activeHunk - 1));
        panel.querySelector('[data-hunk-next]')?.addEventListener('click', () => focusHunk(activeHunk + 1));
        panel.querySelector('[data-copy-diff]').addEventListener('click', async () => { await navigator.clipboard.writeText(change.sourceDiff || ''); announce(text("features.changes.index.036")); });
        showUnified();
    }
    async function renderBeforeAfter(panel: any, change: any) {
        panel.innerHTML = text("features.changes.index.037");
        try {
            const [before, after]: any = await Promise.all([fetchSide(change, 'before', true), fetchSide(change, 'after', true)]);
            panel.innerHTML = text("features.changes.index.038", [before || text("features.changes.index.081"), after || text("features.changes.index.082")]);
            const markSections: any = (root: any, side: any) => {
                (change.renderedSections || []).forEach((section: any) => {
                    const anchor: any = side === 'before' ? section.anchorBefore : section.anchorAfter;
                    if (!anchor)
                        return;
                    const heading: any = root.querySelector(`#${CSS.escape(anchor)}`);
                    if (!heading)
                        return;
                    heading.classList.add('rendered-section-heading', section.status);
                    heading.dataset.changeLabel = section.status.replace('-section', '').replace('-', ' ');
                    let sibling: any = heading.nextElementSibling;
                    while (sibling && sibling.tagName !== 'H2') {
                        sibling.classList.add('rendered-section-content', section.status);
                        sibling = sibling.nextElementSibling;
                    }
                });
            };
            const documents: any = panel.querySelectorAll('.rendered-document');
            if (documents[0])
                markSections(documents[0], 'before');
            if (documents[1])
                markSections(documents[1], 'after');
            if (window.mermaid) {
                window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
                for (const diagram of panel.querySelectorAll('.mermaid')) {
                    try {
                        await window.mermaid.run({ nodes: [diagram] });
                    }
                    catch {
                        diagram.insertAdjacentHTML('afterend', text("features.changes.index.039"));
                    }
                }
            }
        }
        catch (error: any) {
            panel.innerHTML = text("features.changes.index.040", [escapeHTML(error.message)]);
        }
    }
    async function renderMermaid(panel: any, change: any) {
        const blocks: any = change.mermaidBlocks || [];
        if (!blocks.length) {
            panel.innerHTML = text("features.changes.index.041");
            return;
        }
        panel.innerHTML = blocks.map((block: any) => text("features.changes.index.042", [escapeHTML(block.caption || block.id), escapeHTML(block.status), escapeHTML(statusLabel(block.status)), block.before ? `<div class="mermaid-canvas" data-mermaid-canvas><pre class="mermaid">${escapeHTML(block.before)}</pre></div>` : text("features.changes.index.083"), block.after ? `<div class="mermaid-canvas" data-mermaid-canvas><pre class="mermaid">${escapeHTML(block.after)}</pre></div>` : text("features.changes.index.084"), mermaidSourceDiff(block.before || '', block.after || '')])).join('');
        if (!window.mermaid)
            return;
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
        for (const diagram of panel.querySelectorAll('.mermaid')) {
            try {
                await window.mermaid.run({ nodes: [diagram] });
            }
            catch {
                diagram.insertAdjacentHTML('afterend', text("features.changes.index.043"));
            }
        }
        panel.querySelectorAll('.mermaid-change').forEach((section: any) => setupMermaidControls(section));
    }
    function mermaidSourceDiff(before: any, after: any) {
        const oldLines: any = before ? before.split('\n') : [];
        const newLines: any = after ? after.split('\n') : [];
        const rows: any = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
        for (let i: any = oldLines.length - 1; i >= 0; i--)
            for (let j: any = newLines.length - 1; j >= 0; j--)
                rows[i][j] = oldLines[i] === newLines[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
        const result: any = [];
        let i: any = 0;
        let j: any = 0;
        while (i < oldLines.length || j < newLines.length) {
            if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
                result.push(`  ${oldLines[i++]}`);
                j++;
            }
            else if (j < newLines.length && (i === oldLines.length || rows[i][j + 1] >= rows[i + 1][j]))
                result.push(`+ ${newLines[j++]}`);
            else
                result.push(`- ${oldLines[i++]}`);
        }
        return escapeHTML(result.join('\n') || text("features.changes.index.044"));
    }
    function setupMermaidControls(section: any) {
        let zoom: any = 1;
        let x: any = 0;
        let y: any = 0;
        let pointer: any = null;
        const canvases: any = [...section.querySelectorAll('[data-mermaid-canvas]')];
        const apply: any = () => canvases.forEach((canvas: any) => { canvas.style.setProperty('--mermaid-zoom', zoom); canvas.style.setProperty('--mermaid-x', `${x}px`); canvas.style.setProperty('--mermaid-y', `${y}px`); });
        section.querySelectorAll('[data-mermaid-zoom]').forEach((button: any) => button.addEventListener('click', () => {
            const action: any = button.dataset.mermaidZoom;
            zoom = action === 'reset' ? 1 : Math.max(.5, Math.min(2.5, zoom + (action === 'in' ? .2 : -.2)));
            if (action === 'reset') {
                x = 0;
                y = 0;
            }
            apply();
        }));
        section.querySelector('[data-mermaid-fullscreen]')?.addEventListener('click', () => {
            if (document.fullscreenElement)
                document.exitFullscreen?.();
            else
                section.requestFullscreen?.();
        });
        canvases.forEach((canvas: any) => {
            canvas.addEventListener('pointerdown', (event: any) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: x, startY: y }; canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('is-panning'); });
            canvas.addEventListener('pointermove', (event: any) => {
                if (!pointer || pointer.id !== event.pointerId)
                    return;
                x = pointer.startX + event.clientX - pointer.x;
                y = pointer.startY + event.clientY - pointer.y;
                apply();
            });
            canvas.addEventListener('pointerup', () => { pointer = null; canvas.classList.remove('is-panning'); });
        });
    }
    function renderSemantic(panel: any, change: any) {
        panel.innerHTML = change.semanticChanges.length ? `<ol class="semantic-list">${change.semanticChanges.map((item: any) => `<li><div><strong>${escapeHTML(item.kind)}</strong>${item.compatibility ? `<span class="compatibility ${item.compatibility}">${escapeHTML(item.compatibility)}</span>` : ''}</div><p>${escapeHTML(item.summary)}</p>${item.before !== undefined || item.after !== undefined ? `<div class="semantic-values"><pre>${escapeHTML(JSON.stringify(item.before, null, 2) || '—')}</pre><pre>${escapeHTML(JSON.stringify(item.after, null, 2) || '—')}</pre></div>` : ''}</li>`).join('')}</ol>` : text("features.changes.index.045");
    }
    function renderRelations(panel: any, change: any) { panel.innerHTML = change.relationChanges.length ? `<ul>${change.relationChanges.map((item: any) => `<li>${escapeHTML(item.kind)}: ${escapeHTML(item.source.id)} → ${escapeHTML(item.target.id)}</li>`).join('')}</ul>` : text("features.changes.index.046"); }
    function renderAssets(panel: any, change: any) {
        const before: any = apiURL('/content', { side: 'before', path: change.path });
        const after: any = apiURL('/content', { side: 'after', path: change.path });
        const meta: any = (side: any, bytes: any) => side ? `${side.width || '?'}×${side.height || '?'} · ratio ${side.aspectRatio || '?'} · ${bytes} bytes${side.transparency == null ? '' : side.transparency ? ' · alpha' : ' · opaque'}` : `${bytes} bytes`;
        const beforePresent: any = change.status !== 'added' && change.status !== 'untracked';
        const afterPresent: any = change.status !== 'deleted';
        const overlay: any = beforePresent && afterPresent && change.asset?.before?.mediaType !== 'image/svg+xml' && change.asset?.after?.mediaType !== 'image/svg+xml';
        panel.innerHTML = text("features.changes.index.047", [escapeHTML(meta(change.asset?.before, change.oldSize)), beforePresent ? text("features.changes.index.085", [escapeHTML(before), escapeHTML(change.path)]) : text("features.changes.index.086"), escapeHTML(meta(change.asset?.after, change.newSize)), afterPresent ? text("features.changes.index.087", [escapeHTML(after), escapeHTML(change.path)]) : text("features.changes.index.088"), overlay ? text("features.changes.index.089", [escapeHTML(before), escapeHTML(after)]) : '']);
        const range: any = panel.querySelector('[data-overlay-range]');
        if (range)
            range.addEventListener('input', () => { const value: any = `${range.value}%`; panel.querySelector('[data-overlay-after]').style.clipPath = `inset(0 0 0 ${value})`; panel.querySelector('[data-overlay-divider]').style.left = value; });
    }
    function renderMap(panel: any, change: any) {
        const screen: any = change.screen;
        if (!screen) {
            panel.innerHTML = text("features.changes.index.048");
            return;
        }
        const before: any = screen.before;
        const after: any = screen.after;
        const node: any = after || before;
        const edge: any = (transition: any) => { const oldValue: any = transition.before; const newValue: any = transition.after; return `<li class="map-change-edge status-${escapeHTML(transition.status)}"><header><strong>${escapeHTML(transition.id)}</strong><span>${escapeHTML(statusLabel(transition.status))}</span></header><div class="map-edge-values"><span>${oldValue ? `${escapeHTML(oldValue.source)} → ${escapeHTML(oldValue.target)}` : text("features.changes.index.049")}</span><span>${newValue ? `${escapeHTML(newValue.source)} → ${escapeHTML(newValue.target)}` : text("features.changes.index.050")}</span></div>${newValue?.action || oldValue?.action ? `<p>${escapeHTML(newValue?.action || oldValue?.action)} · ${escapeHTML(newValue?.condition || oldValue?.condition || '')}</p>` : ''}</li>`; };
        panel.innerHTML = text("features.changes.index.051", [escapeHTML(change.status), after ? '' : 'is-ghost', escapeHTML(node?.id), escapeHTML(statusLabel(change.status)), escapeHTML(node?.title || ''), node?.route ? ` · ${escapeHTML(node.route)}` : '', screen.transitions.length ? `<ol class="map-change-edges">${screen.transitions.map(edge).join('')}</ol>` : text("features.changes.index.090"), apiURL('/screen-map')]);
    }
    function announce(message: any) { elements.toast.textContent = message; elements.toast.classList.add('is-visible'); setTimeout(() => elements.toast.classList.remove('is-visible'), 2200); }
    async function load(preserve: any = true) {
        const response: any = await fetch(apiURL(), { cache: 'no-store' });
        const data: any = await response.json();
        if (!response.ok)
            throw new Error(data.diagnostics?.[0]?.message || `HTTP ${response.status}`);
        const oldPath: any = preserve ? state.selected?.path : null;
        state.report = data;
        state.etag = response.headers.get('ETag') || '';
        renderSummary();
        renderList();
        const requested: any = new URLSearchParams(location.search).get('path') || oldPath;
        const selected: any = data.changes.find((change: any) => change.path === requested || change.oldPath === requested);
        if (selected)
            await selectChange(selected, new URLSearchParams(location.search).get('tab') || state.tab);
    }
    async function init() {
        addToolbarControl(text("features.changes.index.052"), 'entityType', [['', text("features.changes.index.053")], ['use-case', 'UC'], ['flow', 'FLOW'], ['screen', 'SC'], ['transition', 'TR'], ['module', 'MOD'], ['contract', 'Contract'], ['decision', 'ADR'], ['work', 'TASK']]);
        addToolbarControl(text("features.changes.index.054"), 'module', 'MOD-ID', true);
        addToolbarControl(text("features.changes.index.055"), 'task', 'TASK-ID', true);
        addToolbarControl(text("features.changes.index.056"), 'sort', [['path', text("features.changes.index.057")], ['type', text("features.changes.index.058")], ['status', text("features.changes.index.059")], ['changes', text("features.changes.index.060")], ['module', text("features.changes.index.061")], ['id', text("features.changes.index.062")]]);
        addToolbarControl(text("features.changes.index.063"), 'group', [['classification', text("features.changes.index.064")], ['type', text("features.changes.index.065")], ['module', text("features.changes.index.066")], ['status', text("features.changes.index.067")], ['directory', text("features.changes.index.068")], ['task', text("features.changes.index.069")], ['none', text("features.changes.index.070")]]);
        const params: any = new URLSearchParams(location.search);
        const target: any = params.get('target') || 'working-tree';
        elements.base.value = params.get('base') || 'HEAD';
        elements.branchBase.value = params.get('branchBase') || '';
        if (['working-tree', 'index', 'HEAD'].includes(target))
            elements.target.value = target;
        else {
            elements.target.value = 'revision';
            elements.targetRevision.value = target;
            elements.targetRevisionWrap.hidden = false;
        }
        elements.search.value = params.get('q') || '';
        elements.status.value = params.get('status') || '';
        elements.classification.value = params.get('classification') || '';
        elements.gitState.value = params.get('gitState') || '';
        elements.entityType.value = params.get('type') || '';
        elements.module.value = params.get('module') || '';
        elements.task.value = params.get('task') || '';
        elements.sort.value = params.get('sort') || 'path';
        elements.group.value = params.get('group') || 'classification';
        try {
            await load(false);
        }
        catch (error: any) {
            elements.detail.innerHTML = text("features.changes.index.071", [escapeHTML(error.message)]);
        }
        [elements.search, elements.status, elements.classification, elements.gitState, elements.entityType, elements.module, elements.task, elements.sort, elements.group].forEach((control: any) => control.addEventListener('input', () => { renderList(); updateURL(); }));
        elements.target.addEventListener('change', () => {
            elements.targetRevisionWrap.hidden = elements.target.value !== 'revision';
            if (elements.target.value === 'revision')
                elements.targetRevision.focus();
        });
        elements.apply.addEventListener('click', async () => {
            if (elements.target.value === 'revision' && !elements.targetRevision.value.trim()) {
                announce(text("features.changes.index.072"));
                return;
            }
            state.selected = null;
            updateURL();
            try {
                await load(false);
            }
            catch (error: any) {
                announce(error.message);
            }
        });
        setInterval(async () => {
            try {
                const response: any = await fetch(apiURL(), { method: 'HEAD', cache: 'no-store' });
                const next: any = response.headers.get('ETag') || '';
                if (state.etag && next && next !== state.etag) {
                    elements.stale.hidden = false;
                    await load(true);
                    elements.stale.hidden = true;
                }
            }
            catch { /* current report remains readable */ }
        }, 2000);
    }
    init();
})();
