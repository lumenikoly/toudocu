(() => {
  'use strict';
  const API = '/_docgent/api/changes';
  const $ = (selector, root = document) => root.querySelector(selector);
  const state = { report: null, selected: null, tab: 'summary', merge: null, etag: '' };
  const elements = {
    base: $('[data-base]'), branchBase: $('[data-branch-base]'), target: $('[data-target]'), targetRevision: $('[data-target-revision]'), targetRevisionWrap: $('[data-target-revision-wrap]'), apply: $('[data-apply-range]'), range: $('[data-range-summary]'),
    summary: $('[data-summary]'), stale: $('[data-stale]'), search: $('[data-search]'), status: $('[data-status]'),
    classification: $('[data-classification]'), gitState: $('[data-git-state]'), list: $('[data-file-list]'),
    count: $('[data-result-count]'), detail: $('[data-detail]'), toast: $('[data-changes-toast]'),
  };

  function addToolbarControl(label, name, options, input = false) {
    const wrapper = document.createElement('label'); const caption = document.createElement('span'); caption.textContent = label;
    const control = document.createElement(input ? 'input' : 'select'); control.dataset[name] = '';
    if (input) control.placeholder = options; else options.forEach(([value, text]) => control.add(new Option(text, value)));
    wrapper.append(caption, control); $('.changes-toolbar').append(wrapper); elements[name] = control; return control;
  }

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const statusLabel = (status) => ({ added: 'Добавлен', untracked: 'Untracked', modified: 'Изменён', deleted: 'Удалён', renamed: 'Переименован', copied: 'Скопирован', 'type-changed': 'Изменён тип' }[status] || status);
  const selectedTarget = () => elements.target.value === 'revision' ? elements.targetRevision.value.trim() : elements.target.value;
  const query = () => { const params = new URLSearchParams(); if (elements.base.value.trim() && elements.base.value.trim() !== 'HEAD') params.set('base', elements.base.value.trim()); if (elements.branchBase.value.trim()) params.set('branchBase', elements.branchBase.value.trim()); const target = selectedTarget(); if (target && target !== 'working-tree') params.set('target', target); return params; };
  const apiURL = (endpoint = '', extra = {}) => { const params = query(); Object.entries(extra).forEach(([key, value]) => value != null && params.set(key, value)); return `${API}${endpoint}?${params}`; };
  const languageFor = (path) => path.endsWith('.json') ? 'json' : /\.ya?ml$/i.test(path) ? 'yaml' : 'markdown';
  const changeText = (change) => [change.path, change.oldPath, ...change.entitiesBefore.map((item) => `${item.id} ${item.title}`), ...change.entitiesAfter.map((item) => `${item.id} ${item.title}`), ...change.semanticChanges.map((item) => item.summary)].join(' ').toLocaleLowerCase('ru');

  function updateURL() {
    const params = query();
    if (state.selected) params.set('path', state.selected.path);
    if (state.tab !== 'summary') params.set('tab', state.tab);
    if (elements.search.value) params.set('q', elements.search.value);
    if (elements.status.value) params.set('status', elements.status.value);
    if (elements.classification.value) params.set('classification', elements.classification.value);
    if (elements.gitState.value) params.set('gitState', elements.gitState.value);
    if (elements.entityType.value) params.set('type', elements.entityType.value);
    if (elements.module.value) params.set('module', elements.module.value);
    if (elements.task.value) params.set('task', elements.task.value);
    if (elements.sort.value !== 'path') params.set('sort', elements.sort.value);
    if (elements.group.value !== 'classification') params.set('group', elements.group.value);
    history.replaceState(null, '', `/changes/?${params}`);
  }

  function renderSummary() {
    const { report } = state; const summary = report.summary;
    elements.range.textContent = `Base: ${report.comparison.base.displayRef} — ${report.comparison.base.resolved.slice(0, 7)} · Target: ${report.comparison.target.displayRef}${report.comparison.target.resolved ? ` — ${report.comparison.target.resolved.slice(0, 7)}` : ''} · Branch: ${report.repository.branch || 'detached HEAD'} · State: ${report.repository.dirty ? 'dirty' : 'clean'}`;
    const metrics = [['Добавлено', summary.files.added + summary.files.untracked], ['Изменено', summary.files.modified], ['Удалено', summary.files.deleted], ['Переименовано', summary.files.renamed], ['Строки', `+${summary.lines.added} −${summary.lines.deleted}`]];
    elements.summary.innerHTML = metrics.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  }

  function matches(change) {
    const search = elements.search.value.trim().toLocaleLowerCase('ru');
    if (search && !changeText(change).includes(search)) return false;
    if (elements.status.value && change.status !== elements.status.value) return false;
    if (elements.classification.value && change.classification !== elements.classification.value) return false;
    const git = elements.gitState.value; if (git && !change.gitState[git]) return false;
    if (elements.entityType.value && ![...change.entitiesBefore, ...change.entitiesAfter].some((item) => item.type === elements.entityType.value)) return false;
    if (elements.module.value && !changeText(change).includes(elements.module.value.toLocaleLowerCase('ru'))) return false;
    if (elements.task.value && !changeText(change).includes(elements.task.value.toLocaleLowerCase('ru'))) return false;
    return true;
  }

  function renderList() {
    const changes = state.report.changes.filter(matches).sort((left, right) => {
      if (elements.sort.value === 'status') return left.status.localeCompare(right.status) || left.path.localeCompare(right.path);
      if (elements.sort.value === 'changes') return (right.lines.added + right.lines.deleted) - (left.lines.added + left.lines.deleted) || left.path.localeCompare(right.path);
      if (elements.sort.value === 'type') return (left.entitiesAfter[0]?.type || left.entitiesBefore[0]?.type || '').localeCompare(right.entitiesAfter[0]?.type || right.entitiesBefore[0]?.type || '') || left.path.localeCompare(right.path);
		if (elements.sort.value === 'module') return changeModule(left).localeCompare(changeModule(right)) || left.path.localeCompare(right.path);
		if (elements.sort.value === 'id') return changeID(left).localeCompare(changeID(right)) || left.path.localeCompare(right.path);
      return left.path.localeCompare(right.path);
    });
    elements.count.textContent = `${changes.length} из ${state.report.changes.length}`;
    elements.list.replaceChildren();
    const groupKey = (change) => { if (elements.group.value === 'status') return change.status; if (elements.group.value === 'type') return change.entitiesAfter[0]?.type || change.entitiesBefore[0]?.type || 'unknown'; if (elements.group.value === 'module') return changeModule(change) || 'Без модуля'; if (elements.group.value === 'task') return changeTask(change) || 'Без связанной задачи'; if (elements.group.value === 'directory') return change.path.split('/').slice(0, -1).join('/') || '/'; if (elements.group.value === 'none') return ''; return change.classification; };
    const labels = { 'permanent-documentation': 'Постоянная документация', contract: 'Контракты', asset: 'Assets', 'work-artifact': 'Рабочие артефакты' };
    [...new Set(changes.map(groupKey))].forEach((key) => {
      const items = changes.filter((change) => groupKey(change) === key); if (!items.length) return; const label = labels[key] || key || 'Все документы';
      const heading = document.createElement('h3'); heading.textContent = label; elements.list.append(heading);
      items.forEach((change) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = `changes-file ${state.selected?.path === change.path ? 'is-active' : ''}`; button.dataset.path = change.path;
        const entity = change.entitiesAfter[0] || change.entitiesBefore[0];
        button.innerHTML = `<span class="changes-file-status status-${escapeHTML(change.status)}">${escapeHTML(statusLabel(change.status))}</span><strong>${escapeHTML(entity?.id || change.path.split('/').pop())}</strong><span class="changes-file-title">${escapeHTML(entity?.title || '')}</span><span class="changes-file-path">${escapeHTML(change.oldPath ? `${change.oldPath} → ${change.path}` : change.path)}</span><span class="changes-line-stats">+${change.lines.added} −${change.lines.deleted}</span>`;
        button.addEventListener('click', () => selectChange(change)); elements.list.append(button);
      });
    });
    if (!changes.length) elements.list.innerHTML = '<div class="changes-list-empty"><strong>Совпадений нет</strong><p>Сбросьте фильтры или измените запрос.</p></div>';
  }

  const changeID = (change) => change.entitiesAfter[0]?.id || change.entitiesBefore[0]?.id || '';
  const changeModule = (change) => change.semanticChanges.find((item) => item.field === 'module')?.after || change.semanticChanges.find((item) => item.field === 'module')?.before || '';
  const changeTask = (change) => (changeText(change).match(/TASK-[A-Z0-9-]+/) || [])[0] || '';

  const tabsFor = (change) => [['summary', 'Сводка'], ['source', 'Исходник'], ...(change.renderedDiffAvailable ? [['rendered', 'До и после']] : []), ...(change.semanticDiffAvailable ? [['semantic', 'Семантика']] : []), ['relations', 'Связи'], ...(change.classification === 'contract' ? [['openapi', 'OpenAPI']] : []), ...(change.mermaidBlocks?.length ? [['mermaid', 'Mermaid']] : []), ...(change.classification === 'asset' ? [['assets', 'Assets']] : []), ...([...(change.entitiesBefore || []), ...(change.entitiesAfter || [])].some((item) => item.type === 'screen' || item.type === 'transition') ? [['map', 'Карта']] : [])];

  async function selectChange(change, tab = state.tab) {
    if (change.sourceDiffAvailable && !change.sourceDiff) {
      try { const response = await fetch(apiURL('/file', { path: change.path }), { cache: 'no-store' }); if (response.ok) change = await response.json(); } catch { /* summary remains usable */ }
    }
    state.selected = change; state.tab = tabsFor(change).some(([id]) => id === tab) ? tab : 'summary'; state.merge?.destroy?.(); state.merge = null;
    renderList(); updateURL(); await renderDetail();
  }

  function detailHeader(change) {
    const entity = change.entitiesAfter[0] || change.entitiesBefore[0];
    return `<header class="changes-detail-header"><div><span class="changes-file-status status-${escapeHTML(change.status)}">${escapeHTML(statusLabel(change.status))}</span><h2>${escapeHTML(entity?.id || change.path.split('/').pop())}${entity?.title ? ` — ${escapeHTML(entity.title)}` : ''}</h2><p>${escapeHTML(change.oldPath ? `${change.oldPath} → ${change.path}` : change.path)} · +${change.lines.added} −${change.lines.deleted}</p></div><a class="changes-button secondary" href="/_docgent/editor/?path=${encodeURIComponent(change.path.replace(/^docs\//, ''))}">Редактировать текущий файл</a></header><nav class="changes-tabs" role="tablist" aria-label="Представления изменения">${tabsFor(change).map(([id, label]) => `<button type="button" role="tab" aria-selected="${state.tab === id}" data-tab="${id}">${label}</button>`).join('')}</nav><div class="changes-tab-panel" data-tab-panel></div>`;
  }

  async function renderDetail() {
    const change = state.selected; if (!change) return;
    elements.detail.innerHTML = detailHeader(change);
    elements.detail.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => selectChange(change, button.dataset.tab)));
    const panel = $('[data-tab-panel]', elements.detail);
    if (state.tab === 'summary') renderChangeSummary(panel, change);
    if (state.tab === 'source') await renderSource(panel, change);
    if (state.tab === 'rendered') await renderBeforeAfter(panel, change);
    if (state.tab === 'semantic') renderSemantic(panel, change);
    if (state.tab === 'relations') renderRelations(panel, change);
    if (state.tab === 'openapi') renderSemantic(panel, change);
    if (state.tab === 'mermaid') await renderMermaid(panel, change);
    if (state.tab === 'assets') renderAssets(panel, change);
    if (state.tab === 'map') renderMap(panel, change);
  }

  function renderChangeSummary(panel, change) {
    const semantic = change.semanticChanges.slice(0, 8);
    panel.innerHTML = `<section class="changes-detail-summary"><h3>Что изменилось</h3>${semantic.length ? `<ul>${semantic.map((item) => `<li>${escapeHTML(item.summary)}${item.compatibility ? ` <span class="compatibility ${item.compatibility}">${escapeHTML(item.compatibility)}</span>` : ''}</li>`).join('')}</ul>` : '<p>Смысловые изменения не определены. Source diff остаётся доступен.</p>'}<dl><div><dt>Git state</dt><dd>${['staged', 'unstaged', 'untracked', 'committedInBranch'].filter((key) => change.gitState[key]).join(', ') || 'committed comparison'}</dd></div><div><dt>Размер</dt><dd>${change.oldSize} → ${change.newSize} bytes</dd></div><div><dt>Представления</dt><dd>source: ${change.sourceDiffAvailable ? 'да' : 'нет'} · rendered: ${change.renderedDiffAvailable ? 'да' : 'нет'} · semantic: ${change.semanticDiffAvailable ? 'да' : 'нет'}</dd></div></dl>${change.diagnostics.length ? `<h3>Diagnostics</h3><ul>${change.diagnostics.map((item) => `<li><code>${escapeHTML(item.code)}</code> ${escapeHTML(item.message)}</li>`).join('')}</ul>` : ''}</section>`;
  }

  async function fetchSide(change, side, render = false) {
    const response = await fetch(apiURL(render ? '/render' : '/content', { side, path: change.path }), { cache: 'no-store' });
    if (response.status === 204) return ''; if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text();
  }

  async function renderSource(panel, change) {
    panel.innerHTML = `<div class="source-actions"><button type="button" class="changes-button secondary" data-source-mode="unified">Unified</button><button type="button" class="changes-button secondary" data-source-mode="merge">Side by side</button><button type="button" class="changes-button secondary" data-copy-diff>Копировать diff</button>${change.sourceDiffHunks?.length > 1 ? '<button type="button" class="changes-button secondary" data-hunk-previous>Предыдущий hunk</button><button type="button" class="changes-button secondary" data-hunk-next>Следующий hunk</button>' : ''}</div><div data-source-view></div>`;
    const host = $('[data-source-view]', panel);
    let activeHunk = 0;
    const renderHunkLine = (line, counters) => {
      let oldLine = '', newLine = ''; const marker = line[0] || ' ';
      if (marker === ' ') { oldLine = counters.old++; newLine = counters.new++; }
      if (marker === '-') oldLine = counters.old++;
      if (marker === '+') newLine = counters.new++;
      return `<span class="diff-line diff-line-${marker === '+' ? 'added' : marker === '-' ? 'removed' : 'context'}"><span class="diff-line-number">${oldLine}</span><span class="diff-line-number">${newLine}</span><span class="diff-line-marker">${escapeHTML(marker)}</span><span class="diff-line-content">${escapeHTML(line.slice(1))}</span></span>`;
    };
    const focusHunk = (index) => {
      const hunks = [...host.querySelectorAll('.changes-hunk')]; if (!hunks.length) return;
      activeHunk = (index + hunks.length) % hunks.length; hunks[activeHunk].scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); hunks[activeHunk].focus(); location.hash = hunks[activeHunk].id;
    };
    const showUnified = () => {
      state.merge?.destroy?.(); state.merge = null; host.replaceChildren();
      if (!change.sourceDiffHunks?.length) { const pre = document.createElement('pre'); pre.className = 'changes-diff'; pre.textContent = change.sourceDiff || 'Полный source diff недоступен.'; host.append(pre); return; }
      change.sourceDiffHunks.forEach((hunk, index) => {
        const article = document.createElement('article'); article.className = 'changes-hunk'; article.id = hunk.id; article.tabIndex = -1;
        const lines = hunk.patch.split('\n'); const header = lines.shift(); if (lines.at(-1) === '') lines.pop(); const counters = { old: hunk.oldStart, new: hunk.newStart };
        article.innerHTML = `<header><a href="#${escapeHTML(hunk.id)}" aria-label="Ссылка на hunk ${index + 1}">${escapeHTML(header)}</a><span>−${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines}</span><button type="button" class="changes-button secondary" data-copy-hunk>Копировать hunk</button></header><pre>${lines.map((line) => renderHunkLine(line, counters)).join('')}</pre>`;
        article.querySelector('a').addEventListener('click', (event) => { event.preventDefault(); activeHunk = index; history.replaceState(null, '', `${location.pathname}${location.search}#${hunk.id}`); article.focus(); });
        article.querySelector('[data-copy-hunk]').addEventListener('click', async () => { await navigator.clipboard.writeText(hunk.patch); announce('Hunk скопирован.'); });
        host.append(article);
      });
      const requested = decodeURIComponent(location.hash.slice(1)); const requestedIndex = change.sourceDiffHunks.findIndex((hunk) => hunk.id === requested); if (requestedIndex >= 0) requestAnimationFrame(() => focusHunk(requestedIndex));
    };
    const showMerge = async () => { host.innerHTML = '<div class="changes-loading">Загрузка обеих версий…</div>'; try { const [before, after] = await Promise.all([fetchSide(change, 'before'), fetchSide(change, 'after')]); host.replaceChildren(); if (window.DocgentCodeMirror?.createMerge) state.merge = window.DocgentCodeMirror.createMerge({ parent: host, before, after, language: languageFor(change.path) }); else { host.innerHTML = `<div class="source-columns"><pre>${escapeHTML(before)}</pre><pre>${escapeHTML(after)}</pre></div>`; } } catch (error) { host.innerHTML = `<div class="changes-error">Не удалось загрузить версии: ${escapeHTML(error.message)}</div>`; } };
    panel.querySelector('[data-source-mode="unified"]').addEventListener('click', showUnified); panel.querySelector('[data-source-mode="merge"]').addEventListener('click', showMerge);
    panel.querySelector('[data-hunk-previous]')?.addEventListener('click', () => focusHunk(activeHunk - 1)); panel.querySelector('[data-hunk-next]')?.addEventListener('click', () => focusHunk(activeHunk + 1));
    panel.querySelector('[data-copy-diff]').addEventListener('click', async () => { await navigator.clipboard.writeText(change.sourceDiff || ''); announce('Diff скопирован.'); }); showUnified();
  }

  async function renderBeforeAfter(panel, change) {
    panel.innerHTML = '<div class="changes-loading">Рендеринг старой и новой версии…</div>';
    try {
      const [before, after] = await Promise.all([fetchSide(change, 'before', true), fetchSide(change, 'after', true)]);
      panel.innerHTML = `<div class="rendered-columns"><section><h3>До</h3><div class="rendered-document">${before || '<p class="changes-absence">Документ отсутствовал.</p>'}</div></section><section><h3>После</h3><div class="rendered-document">${after || '<p class="changes-absence">Документ удалён.</p>'}</div></section></div>`;
      const markSections = (root, side) => {
        (change.renderedSections || []).forEach((section) => {
          const anchor = side === 'before' ? section.anchorBefore : section.anchorAfter; if (!anchor) return;
          const heading = root.querySelector(`#${CSS.escape(anchor)}`); if (!heading) return;
          heading.classList.add('rendered-section-heading', section.status); heading.dataset.changeLabel = section.status.replace('-section', '').replace('-', ' ');
          let sibling = heading.nextElementSibling; while (sibling && sibling.tagName !== 'H2') { sibling.classList.add('rendered-section-content', section.status); sibling = sibling.nextElementSibling; }
        });
      };
      const documents = panel.querySelectorAll('.rendered-document'); if (documents[0]) markSections(documents[0], 'before'); if (documents[1]) markSections(documents[1], 'after');
      if (window.mermaid) {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
        for (const diagram of panel.querySelectorAll('.mermaid')) {
          try { await window.mermaid.run({ nodes: [diagram] }); }
          catch { diagram.insertAdjacentHTML('afterend', '<p class="changes-error">Не удалось отобразить эту сторону Mermaid.</p>'); }
        }
      }
    } catch (error) { panel.innerHTML = `<div class="changes-error">Rendered diff недоступен: ${escapeHTML(error.message)}</div>`; }
  }

  async function renderMermaid(panel, change) {
    const blocks = change.mermaidBlocks || [];
    if (!blocks.length) { panel.innerHTML = '<div class="changes-empty"><h3>Mermaid-блоки не изменились</h3><p>Изменённый block появится здесь с обеими версиями исходника.</p></div>'; return; }
    panel.innerHTML = blocks.map((block) => `<section class="mermaid-change"><header><strong>${escapeHTML(block.caption || block.id)}</strong><span class="changes-file-status status-${escapeHTML(block.status)}">${escapeHTML(statusLabel(block.status))}</span></header><div class="mermaid-controls" role="group" aria-label="Управление диаграммой"><button type="button" class="changes-button secondary" data-mermaid-zoom="out">−</button><button type="button" class="changes-button secondary" data-mermaid-zoom="reset">100%</button><button type="button" class="changes-button secondary" data-mermaid-zoom="in">+</button><button type="button" class="changes-button secondary" data-mermaid-fullscreen>На весь экран</button></div><div class="rendered-columns"><section><h3>Диаграмма до</h3>${block.before ? `<div class="mermaid-canvas" data-mermaid-canvas><pre class="mermaid">${escapeHTML(block.before)}</pre></div>` : '<p class="changes-absence">Диаграмма отсутствовала.</p>'}</section><section><h3>Диаграмма после</h3>${block.after ? `<div class="mermaid-canvas" data-mermaid-canvas><pre class="mermaid">${escapeHTML(block.after)}</pre></div>` : '<p class="changes-absence">Диаграмма удалена.</p>'}</section></div><h3>Исходный Mermaid diff</h3><pre class="changes-diff mermaid-source-diff">${mermaidSourceDiff(block.before || '', block.after || '')}</pre></section>`).join('');
    if (!window.mermaid) return;
    window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
    for (const diagram of panel.querySelectorAll('.mermaid')) {
      try { await window.mermaid.run({ nodes: [diagram] }); }
      catch { diagram.insertAdjacentHTML('afterend', '<p class="changes-error">Эта версия Mermaid не была отрендерена; исходный текст остаётся доступен.</p>'); }
    }
		panel.querySelectorAll('.mermaid-change').forEach((section) => setupMermaidControls(section));
  }

  function mermaidSourceDiff(before, after) {
    const oldLines = before ? before.split('\n') : []; const newLines = after ? after.split('\n') : [];
    const rows = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
    for (let i = oldLines.length - 1; i >= 0; i--) for (let j = newLines.length - 1; j >= 0; j--) rows[i][j] = oldLines[i] === newLines[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    const result = []; let i = 0; let j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) { result.push(`  ${oldLines[i++]}`); j++; }
      else if (j < newLines.length && (i === oldLines.length || rows[i][j + 1] >= rows[i + 1][j])) result.push(`+ ${newLines[j++]}`);
      else result.push(`- ${oldLines[i++]}`);
    }
    return escapeHTML(result.join('\n') || 'Диаграмма отсутствует на одной из сторон.');
  }

  function setupMermaidControls(section) {
    let zoom = 1; let x = 0; let y = 0; let pointer = null;
    const canvases = [...section.querySelectorAll('[data-mermaid-canvas]')];
    const apply = () => canvases.forEach((canvas) => { canvas.style.setProperty('--mermaid-zoom', zoom); canvas.style.setProperty('--mermaid-x', `${x}px`); canvas.style.setProperty('--mermaid-y', `${y}px`); });
    section.querySelectorAll('[data-mermaid-zoom]').forEach((button) => button.addEventListener('click', () => { const action = button.dataset.mermaidZoom; zoom = action === 'reset' ? 1 : Math.max(.5, Math.min(2.5, zoom + (action === 'in' ? .2 : -.2))); if (action === 'reset') { x = 0; y = 0; } apply(); }));
    section.querySelector('[data-mermaid-fullscreen]')?.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen?.(); else section.requestFullscreen?.(); });
    canvases.forEach((canvas) => {
      canvas.addEventListener('pointerdown', (event) => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: x, startY: y }; canvas.setPointerCapture?.(event.pointerId); canvas.classList.add('is-panning'); });
      canvas.addEventListener('pointermove', (event) => { if (!pointer || pointer.id !== event.pointerId) return; x = pointer.startX + event.clientX - pointer.x; y = pointer.startY + event.clientY - pointer.y; apply(); });
      canvas.addEventListener('pointerup', () => { pointer = null; canvas.classList.remove('is-panning'); });
    });
  }

  function renderSemantic(panel, change) {
    panel.innerHTML = change.semanticChanges.length ? `<ol class="semantic-list">${change.semanticChanges.map((item) => `<li><div><strong>${escapeHTML(item.kind)}</strong>${item.compatibility ? `<span class="compatibility ${item.compatibility}">${escapeHTML(item.compatibility)}</span>` : ''}</div><p>${escapeHTML(item.summary)}</p>${item.before !== undefined || item.after !== undefined ? `<div class="semantic-values"><pre>${escapeHTML(JSON.stringify(item.before, null, 2) || '—')}</pre><pre>${escapeHTML(JSON.stringify(item.after, null, 2) || '—')}</pre></div>` : ''}</li>`).join('')}</ol>` : '<div class="changes-empty"><h3>Семантических изменений нет</h3><p>Форматирование могло измениться без изменения project model.</p></div>';
  }

  function renderRelations(panel, change) { panel.innerHTML = change.relationChanges.length ? `<ul>${change.relationChanges.map((item) => `<li>${escapeHTML(item.kind)}: ${escapeHTML(item.source.id)} → ${escapeHTML(item.target.id)}</li>`).join('')}</ul>` : '<div class="changes-empty"><h3>Связи не изменились</h3><p>Добавленные и удалённые relation edges появятся здесь.</p></div>'; }
  function renderAssets(panel, change) {
    const before = apiURL('/content', { side: 'before', path: change.path }); const after = apiURL('/content', { side: 'after', path: change.path });
    const meta = (side, bytes) => side ? `${side.width || '?'}×${side.height || '?'} · ratio ${side.aspectRatio || '?'} · ${bytes} bytes${side.transparency == null ? '' : side.transparency ? ' · alpha' : ' · opaque'}` : `${bytes} bytes`;
    const beforePresent = change.status !== 'added' && change.status !== 'untracked'; const afterPresent = change.status !== 'deleted';
    const overlay = beforePresent && afterPresent && change.asset?.before?.mediaType !== 'image/svg+xml' && change.asset?.after?.mediaType !== 'image/svg+xml';
    panel.innerHTML = `<div class="rendered-columns asset-columns"><section><h3>До · ${escapeHTML(meta(change.asset?.before, change.oldSize))}</h3>${beforePresent ? `<img src="${escapeHTML(before)}" alt="Старая версия ${escapeHTML(change.path)}">` : '<p class="changes-absence">Asset отсутствовал.</p>'}</section><section><h3>После · ${escapeHTML(meta(change.asset?.after, change.newSize))}</h3>${afterPresent ? `<img src="${escapeHTML(after)}" alt="Новая версия ${escapeHTML(change.path)}">` : '<p class="changes-absence">Asset удалён.</p>'}</section></div>${overlay ? `<section class="asset-overlay"><h3>Overlay</h3><div class="asset-overlay-stage"><img src="${escapeHTML(before)}" alt="Старая версия"><div data-overlay-after><img src="${escapeHTML(after)}" alt="Новая версия"></div><span data-overlay-divider></span></div><label><span>Положение разделителя</span><input type="range" min="0" max="100" value="50" data-overlay-range></label></section>` : ''}`;
    const range = panel.querySelector('[data-overlay-range]'); if (range) range.addEventListener('input', () => { const value = `${range.value}%`; panel.querySelector('[data-overlay-after]').style.clipPath = `inset(0 0 0 ${value})`; panel.querySelector('[data-overlay-divider]').style.left = value; });
  }
  function renderMap(panel, change) {
    const screen = change.screen; if (!screen) { panel.innerHTML = '<div class="changes-empty"><h3>Screen diff недоступен</h3><p>Документ не содержит распознаваемой модели SC/TR.</p></div>'; return; }
    const before = screen.before; const after = screen.after; const node = after || before;
    const edge = (transition) => { const oldValue = transition.before; const newValue = transition.after; return `<li class="map-change-edge status-${escapeHTML(transition.status)}"><header><strong>${escapeHTML(transition.id)}</strong><span>${escapeHTML(statusLabel(transition.status))}</span></header><div class="map-edge-values"><span>${oldValue ? `${escapeHTML(oldValue.source)} → ${escapeHTML(oldValue.target)}` : 'До: отсутствовал'}</span><span>${newValue ? `${escapeHTML(newValue.source)} → ${escapeHTML(newValue.target)}` : 'После: удалён'}</span></div>${newValue?.action || oldValue?.action ? `<p>${escapeHTML(newValue?.action || oldValue?.action)} · ${escapeHTML(newValue?.condition || oldValue?.condition || '')}</p>` : ''}</li>`; };
    panel.innerHTML = `<div class="map-change-preview"><h3>Изменения карты экранов</h3><div class="map-change-node status-${escapeHTML(change.status)} ${after ? '' : 'is-ghost'}"><strong>${escapeHTML(node?.id)}</strong><span>${escapeHTML(statusLabel(change.status))}</span><small>${escapeHTML(node?.title || '')}${node?.route ? ` · ${escapeHTML(node.route)}` : ''}</small></div><h4>Переходы</h4>${screen.transitions.length ? `<ol class="map-change-edges">${screen.transitions.map(edge).join('')}</ol>` : '<p>Переходы не изменились.</p>'}<p><a href="${apiURL('/screen-map')}">Открыть JSON всей изменённой карты</a></p></div>`;
  }
  function announce(message) { elements.toast.textContent = message; elements.toast.classList.add('is-visible'); setTimeout(() => elements.toast.classList.remove('is-visible'), 2200); }

  async function load(preserve = true) {
    const response = await fetch(apiURL(), { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.diagnostics?.[0]?.message || `HTTP ${response.status}`);
    const oldPath = preserve ? state.selected?.path : null; state.report = data; state.etag = response.headers.get('ETag') || ''; renderSummary(); renderList();
    const requested = new URLSearchParams(location.search).get('path') || oldPath; const selected = data.changes.find((change) => change.path === requested || change.oldPath === requested); if (selected) await selectChange(selected, new URLSearchParams(location.search).get('tab') || state.tab);
  }

  async function init() {
    addToolbarControl('Тип', 'entityType', [['', 'Все типы'], ['use-case', 'UC'], ['flow', 'FLOW'], ['screen', 'SC'], ['transition', 'TR'], ['module', 'MOD'], ['contract', 'Contract'], ['decision', 'ADR'], ['work', 'TASK']]);
    addToolbarControl('Модуль', 'module', 'MOD-ID', true); addToolbarControl('Задача', 'task', 'TASK-ID', true);
    addToolbarControl('Сортировка', 'sort', [['path', 'По пути'], ['type', 'По типу'], ['status', 'По статусу'], ['changes', 'По количеству изменений'], ['module', 'По модулю'], ['id', 'По ID']]);
    addToolbarControl('Группировка', 'group', [['classification', 'По области'], ['type', 'По типу'], ['module', 'По модулю'], ['status', 'По статусу'], ['directory', 'По каталогу'], ['task', 'По связанной задаче'], ['none', 'Без группировки']]);
    const params = new URLSearchParams(location.search); const target = params.get('target') || 'working-tree'; elements.base.value = params.get('base') || 'HEAD'; elements.branchBase.value = params.get('branchBase') || ''; if (['working-tree', 'index', 'HEAD'].includes(target)) elements.target.value = target; else { elements.target.value = 'revision'; elements.targetRevision.value = target; elements.targetRevisionWrap.hidden = false; } elements.search.value = params.get('q') || ''; elements.status.value = params.get('status') || ''; elements.classification.value = params.get('classification') || ''; elements.gitState.value = params.get('gitState') || ''; elements.entityType.value = params.get('type') || ''; elements.module.value = params.get('module') || ''; elements.task.value = params.get('task') || ''; elements.sort.value = params.get('sort') || 'path'; elements.group.value = params.get('group') || 'classification';
    try { await load(false); } catch (error) { elements.detail.innerHTML = `<div class="changes-error"><h2>Изменения недоступны</h2><p>${escapeHTML(error.message)}</p><p>Остальные разделы портала продолжают работать.</p></div>`; }
    [elements.search, elements.status, elements.classification, elements.gitState, elements.entityType, elements.module, elements.task, elements.sort, elements.group].forEach((control) => control.addEventListener('input', () => { renderList(); updateURL(); }));
    elements.target.addEventListener('change', () => { elements.targetRevisionWrap.hidden = elements.target.value !== 'revision'; if (elements.target.value === 'revision') elements.targetRevision.focus(); });
    elements.apply.addEventListener('click', async () => { if (elements.target.value === 'revision' && !elements.targetRevision.value.trim()) { announce('Укажите target Git revision.'); return; } state.selected = null; updateURL(); try { await load(false); } catch (error) { announce(error.message); } });
    setInterval(async () => { try { const response = await fetch(apiURL(), { method: 'HEAD', cache: 'no-store' }); const next = response.headers.get('ETag') || ''; if (state.etag && next && next !== state.etag) { elements.stale.hidden = false; await load(true); elements.stale.hidden = true; } } catch { /* current report remains readable */ } }, 2000);
  }
  init();
})();
