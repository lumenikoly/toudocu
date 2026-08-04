(() => {
  'use strict';

  const workspace = document.querySelector('[data-screen-map]');
  if (!workspace) return;
  const data = JSON.parse(workspace.querySelector('[data-screen-map-data]')?.textContent || '{}');
  const screens = data.screens || [];
  const transitions = data.transitions || [];
  const flows = data.flows || [];
  const byId = new Map(screens.map((screen) => [screen.id, screen]));
  const nodeById = new Map([...workspace.querySelectorAll('[data-screen-node]')].map((node) => [node.dataset.screenNode, node]));
  const stage = workspace.querySelector('[data-map-stage]');
  const viewport = workspace.querySelector('[data-map-viewport]');
  const groupsLayer = workspace.querySelector('[data-map-groups]');
  const nodesLayer = workspace.querySelector('[data-map-nodes]');
  const edgeLayer = workspace.querySelector('[data-map-edges]');
  const inspector = workspace.querySelector('[data-map-inspector]');
  const empty = workspace.querySelector('[data-map-empty]');
  const status = workspace.querySelector('[data-map-summary]');
  const moduleSelect = workspace.querySelector('[data-map-module]');
  const useCaseSelect = workspace.querySelector('[data-map-usecase]');
  const statusSelect = workspace.querySelector('[data-map-status]');
  const search = workspace.querySelector('[data-map-search]');
  let mode = 'all';
  let selected = '';
  let selectedTransition = '';
  let scale = 1;
  let panX = 24;
  let panY = 24;
  let dragging = false;
  let dragStart = null;
  let visible = new Set(screens.map((screen) => screen.id));
  let activeEdges = transitions;
  const positions = new Map();
  let groupBounds = [];

  function selectedFlow() {
    return flows.find((flow) => flow.useCase === useCaseSelect?.value);
  }

  function computeVisible() {
    const query = (search?.value || '').trim().toLocaleLowerCase();
    let values = screens;
    if (mode === 'module' && moduleSelect?.value) values = values.filter((screen) => screen.module === moduleSelect.value);
    if (mode === 'usecase' && selectedFlow()) {
      const allowed = new Set(selectedFlow().reachableScreens || []);
      values = values.filter((screen) => allowed.has(screen.id));
    }
    if (mode === 'unfinished') values = values.filter((screen) => ['in-progress', 'planned', 'blocked'].includes(screen.status?.kind));
    if (statusSelect?.value) values = values.filter((screen) => screen.status?.kind === statusSelect.value);
    if (query) {
      values = values.filter((screen) => [screen.id, screen.title, screen.route, screen.module].join(' ').toLocaleLowerCase().includes(query));
    }
    visible = new Set(values.map((screen) => screen.id));
    if (mode === 'sitemap') {
      activeEdges = screens.filter((screen) => screen.parent && visible.has(screen.parent) && visible.has(screen.id))
        .map((screen) => ({ id: `parent-${screen.id}`, source: screen.parent, target: screen.id, action: 'Содержит', condition: '', type: 'navigation' }));
    } else {
      activeEdges = transitions.filter((transition) => visible.has(transition.source) && visible.has(transition.target));
      if (mode === 'usecase' && useCaseSelect?.value) {
        activeEdges = activeEdges.filter((transition) => !transition.useCase || transition.useCase === useCaseSelect.value);
      }
    }
  }

  function layout() {
    positions.clear();
    groupBounds = [];
    const ids = [...visible].sort();
    if (mode === 'all' || mode === 'module' || mode === 'unfinished') {
      const groups = new Map();
      ids.forEach((id) => {
        const module = byId.get(id)?.module || 'Без модуля';
        if (!groups.has(module)) groups.set(module, []);
        groups.get(module).push(id);
      });
      let cursorX = 40;
      [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).forEach(([module, members]) => {
        members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const columns = Math.min(2, members.length);
        const rows = Math.ceil(members.length / columns);
        const width = columns * 310 + 30;
        const height = rows * 288 + 70;
        members.forEach((id, index) => {
          positions.set(id, { x: cursorX + 20 + (index % columns) * 310, y: 70 + Math.floor(index / columns) * 288 });
        });
        groupBounds.push({ module, x: cursorX, y: 30, width, height });
        cursorX += width + 35;
      });
      const maxX = Math.max(900, cursorX + 20);
      const maxY = Math.max(620, ...groupBounds.map((group) => group.y + group.height + 30));
      setCanvasSize(maxX, maxY);
      return;
    }
    const incoming = new Map(ids.map((id) => [id, 0]));
    const adjacency = new Map(ids.map((id) => [id, []]));
    activeEdges.forEach((edge) => {
      if (!visible.has(edge.source) || !visible.has(edge.target) || edge.source === edge.target) return;
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
      adjacency.get(edge.source)?.push(edge.target);
    });
    const roots = ids.filter((id) => (incoming.get(id) || 0) === 0);
    if (!roots.length && ids.length) roots.push(ids[0]);
    const levels = new Map();
    const queue = roots.map((id) => [id, 0]);
    while (queue.length) {
      const [id, depth] = queue.shift();
      if ((levels.get(id) ?? -1) >= depth) continue;
      levels.set(id, depth);
      (adjacency.get(id) || []).forEach((target) => queue.push([target, Math.min(depth + 1, ids.length)]));
    }
    ids.forEach((id) => {
      if (!levels.has(id)) levels.set(id, 0);
    });
    const groups = new Map();
    ids.forEach((id) => {
      const level = levels.get(id);
      if (!groups.has(level)) groups.set(level, []);
      groups.get(level).push(id);
    });
    const vertical = mode === 'sitemap';
    [...groups.entries()].sort((a, b) => a[0] - b[0]).forEach(([level, members]) => {
      members.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      members.forEach((id, row) => {
        positions.set(id, vertical
          ? { x: 40 + row * 310, y: 40 + level * 330 }
          : { x: 40 + level * 350, y: 40 + row * 300 });
      });
    });
    const maxX = Math.max(900, ...[...positions.values()].map((position) => position.x + 290));
    const maxY = Math.max(620, ...[...positions.values()].map((position) => position.y + 260));
    setCanvasSize(maxX, maxY);
  }

  function setCanvasSize(width, height) {
    nodesLayer.style.width = `${width}px`;
    nodesLayer.style.height = `${height}px`;
    groupsLayer.style.width = `${width}px`;
    groupsLayer.style.height = `${height}px`;
    edgeLayer.setAttribute('width', width);
    edgeLayer.setAttribute('height', height);
    viewport.style.width = `${width}px`;
    viewport.style.height = `${height}px`;
  }

  function drawGroups() {
    groupsLayer.replaceChildren();
    groupBounds.forEach((group) => {
      const element = document.createElement('div');
      element.className = 'screen-module-group';
      element.style.transform = `translate(${group.x}px, ${group.y}px)`;
      element.style.width = `${group.width}px`;
      element.style.height = `${group.height}px`;
      const label = document.createElement('strong');
      label.textContent = group.module;
      element.append(label);
      groupsLayer.append(element);
    });
  }

  function edgePath(edge) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (!source || !target) return '';
    if (edge.source === edge.target) {
      const x = source.x + 278;
      const y = source.y + 80;
      return `M ${x} ${y} C ${x + 85} ${y - 70}, ${x + 85} ${y + 150}, ${x} ${y + 120}`;
    }
    if (edge.type === 'return') {
      const x1 = source.x + 139, y1 = source.y;
      const x2 = target.x + 139, y2 = target.y;
      const lift = Math.min(y1, y2) - 80;
      const bend = Math.abs(x2 - x1) < 80 ? -90 : 0;
      return `M ${x1} ${y1} C ${x1 + bend} ${lift}, ${x2 + bend} ${lift}, ${x2} ${y2}`;
    }
    const vertical = mode === 'sitemap';
    if (vertical) {
      const x1 = source.x + 139, y1 = source.y + 248, x2 = target.x + 139, y2 = target.y;
      const middle = (y1 + y2) / 2;
      return `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2}`;
    }
    const x1 = source.x + 278, y1 = source.y + 115, x2 = target.x, y2 = target.y + 115;
    const middle = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2} ${y2}`;
  }

  function edgeLabelPosition(edge) {
    const source = positions.get(edge.source);
    const target = positions.get(edge.target);
    if (edge.source === edge.target) {
      return {
        x: source.x + 345,
        y: source.y + 55,
      };
    }
    if (edge.type === 'return') {
      const bend = Math.abs(target.x - source.x) < 80 ? -70 : 0;
      return {
        x: (source.x + target.x + 278) / 2 + bend,
        y: Math.min(source.y, target.y) - 90,
      };
    }
    return {
      x: (source.x + target.x + 278) / 2,
      y: (source.y + target.y + 210) / 2 - 10,
    };
  }

  function drawEdges() {
    edgeLayer.innerHTML = `<defs><marker id="screen-map-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"></path></marker></defs>`;
    activeEdges.forEach((edge) => {
      const pathData = edgePath(edge);
      if (!pathData) return;
      const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      group.classList.add('screen-edge', `screen-edge-${edge.type || 'navigation'}`);
      group.dataset.transitionId = edge.id;
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', `${edge.id}: ${edge.action}, ${edge.condition}`);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add('screen-edge-path');
      path.setAttribute('d', pathData);
      path.setAttribute('marker-end', 'url(#screen-map-arrow)');
      if (edge.type === 'external') {
        const outerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        outerPath.classList.add('screen-edge-path', 'screen-edge-external-outer');
        outerPath.setAttribute('d', pathData);
        path.classList.add('screen-edge-external-inner');
        group.append(outerPath);
      }
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const labelPosition = edgeLabelPosition(edge);
      label.setAttribute('x', labelPosition.x);
      label.setAttribute('y', labelPosition.y);
      label.textContent = edge.condition ? `${edge.action} · ${edge.condition}` : edge.action;
      group.append(path, label);
      const choose = (event) => {
        event.stopPropagation();
        selectTransition(edge.id);
      };
      group.addEventListener('click', choose);
      group.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          choose(event);
        }
      });
      edgeLayer.append(group);
    });
  }

  function applyTransform() {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (status) status.textContent = `${visible.size} экранов · ${activeEdges.length} переходов · ${Math.round(scale * 100)}%`;
  }

  function renderInspector(id) {
    const screen = byId.get(id);
    if (!screen) {
      inspector.innerHTML = `<div class="screen-inspector-empty"><strong>Выберите экран</strong><span>Здесь появятся состояния, связи и затронутые документы.</span></div>`;
      return;
    }
    const incomingRows = transitions.filter((transition) => transition.target === id)
      .map((transition) => `<li><code>${escapeText(transition.id)}</code><span>${escapeText(transition.source)} · ${escapeText(transition.action)} · ${escapeText(transition.condition)}</span></li>`).join('');
    const outgoingRows = transitions.filter((transition) => transition.source === id)
      .map((transition) => `<li><code>${escapeText(transition.id)}</code><span>${escapeText(transition.action)} · ${escapeText(transition.condition)} → ${escapeText(transition.target)}${transition.state ? ` @${escapeText(transition.state)}` : ''}${transition.error ? ` · ${escapeText(transition.error)}` : ''}${transition.useCase ? ` · ${escapeText(transition.useCase)}` : ''}</span></li>`).join('');
    const states = (screen.states || []).map((state) => `<span class="screen-state-chip">${escapeText(state.id)}</span>`).join('');
    const preview = screen.preview
      ? `<img class="screen-inspector-preview" src="${escapeAttribute(screen.preview)}" alt="Превью ${escapeAttribute(screen.title)}">`
      : `<div class="screen-inspector-preview screen-preview-placeholder"><strong>${escapeText(screen.id)}</strong><span>Превью отсутствует</span></div>`;
    inspector.innerHTML = `<div class="screen-inspector-head"><span>${escapeText(screen.module)}</span><button type="button" data-inspector-close aria-label="Закрыть">×</button></div>
      <p class="screen-eyebrow">${escapeText(screen.id)}</p><h2>${escapeText(screen.title)}</h2>${preview}<p>${escapeText(screen.description || '')}</p>
      <dl><div><dt>Статус</dt><dd>${escapeText(screen.status?.label || '')}</dd></div><div><dt>Маршрут</dt><dd><code>${escapeText(screen.route || '—')}</code></dd></div>
      <div><dt>Владелец</dt><dd>${escapeText(screen.owner || '—')}</dd></div><div><dt>Компонент</dt><dd><code>${escapeText(screen.component || '—')}</code></dd></div></dl>
      <div class="screen-inspector-states">${states}</div>
      <h3>Сценарии и задачи</h3><p>${escapeText([...(screen.useCases || []), ...(screen.workItems || [])].join(' · ') || 'Связей нет')}</p>
      <h3>Контракты</h3><p>${escapeText((screen.contracts || []).join(' · ') || 'Связей нет')}</p>
      <h3>Исходящие переходы</h3><ul>${outgoingRows || '<li>Нет переходов</li>'}</ul>
      <h3>Входящие переходы</h3><ul>${incomingRows || '<li>Нет переходов</li>'}</ul>
      <a class="primary-link" href="${escapeAttribute(data.screenUrls?.[id] || '#')}">Открыть документ →</a>`;
    inspector.querySelector('[data-inspector-close]')?.addEventListener('click', () => selectScreen(''));
  }

  function escapeText(value) {
    const element = document.createElement('span');
    element.textContent = value == null ? '' : String(value);
    return element.innerHTML;
  }

  function escapeAttribute(value) {
    return escapeText(value).replaceAll('"', '&quot;');
  }

  function selectScreen(id) {
    selected = id;
    selectedTransition = '';
    nodeById.forEach((node, nodeId) => node.classList.toggle('is-selected', nodeId === id));
    edgeLayer.querySelectorAll('.screen-edge').forEach((edge) => {
      const transition = transitions.find((item) => item.id === edge.dataset.transitionId);
      edge.classList.toggle('is-related', Boolean(id && transition && (transition.source === id || transition.target === id)));
      edge.classList.toggle('is-muted', Boolean(id && transition && transition.source !== id && transition.target !== id));
    });
    renderInspector(id);
  }

  function selectTransition(id) {
    const transition = transitions.find((item) => item.id === id) || activeEdges.find((item) => item.id === id);
    if (!transition) return;
    selected = '';
    selectedTransition = id;
    nodeById.forEach((node, nodeId) => node.classList.toggle('is-selected', nodeId === transition.source || nodeId === transition.target));
    edgeLayer.querySelectorAll('.screen-edge').forEach((edge) => {
      edge.classList.toggle('is-related', edge.dataset.transitionId === id);
      edge.classList.toggle('is-muted', edge.dataset.transitionId !== id);
    });
    inspector.innerHTML = `<div class="screen-inspector-head"><span>${escapeText(transition.type || 'navigation')}</span><button type="button" data-inspector-close aria-label="Закрыть">×</button></div>
      <p class="screen-eyebrow">${escapeText(transition.id)}</p><h2>${escapeText(transition.action)}</h2>
      <dl><div><dt>Условие</dt><dd>${escapeText(transition.condition)}</dd></div><div><dt>Откуда</dt><dd><code>${escapeText(transition.source)}</code></dd></div>
      <div><dt>Куда</dt><dd><code>${escapeText(transition.target)}</code></dd></div><div><dt>Сценарий</dt><dd>${escapeText(transition.useCase || 'Глобальный')}</dd></div>
      <div><dt>Состояние</dt><dd>${escapeText(transition.state || 'DEFAULT')}</dd></div><div><dt>Ошибка</dt><dd>${escapeText(transition.error || '—')}</dd></div></dl>
      ${transition.message ? `<div class="screen-transition-message"><strong>${escapeText(transition.error || 'Сообщение')}</strong><span>${escapeText(transition.message)}</span></div>` : ''}`;
    inspector.querySelector('[data-inspector-close]')?.addEventListener('click', () => selectScreen(''));
  }

  function render({ fit = false } = {}) {
    computeVisible();
    nodeById.forEach((node, id) => {
      node.hidden = !visible.has(id);
      if (visible.has(id)) {
        const position = positions.get(id);
        if (position) node.style.transform = `translate(${position.x}px, ${position.y}px)`;
      }
    });
    layout();
    nodeById.forEach((node, id) => {
      const position = positions.get(id);
      if (position) node.style.transform = `translate(${position.x}px, ${position.y}px)`;
    });
    drawGroups();
    drawEdges();
    empty.hidden = visible.size > 0;
    if (selected && !visible.has(selected)) selectScreen('');
    if (fit) fitToStage();
    else applyTransform();
  }

  function fitToStage() {
    const width = parseFloat(viewport.style.width) || 900;
    const height = parseFloat(viewport.style.height) || 620;
    scale = Math.min(1, Math.max(.2, Math.min((stage.clientWidth - 48) / width, (stage.clientHeight - 48) / height)));
    panX = Math.max(24, (stage.clientWidth - width * scale) / 2);
    panY = Math.max(24, (stage.clientHeight - height * scale) / 2);
    applyTransform();
  }

  function setScale(next, originX = stage.clientWidth / 2, originY = stage.clientHeight / 2) {
    const previous = scale;
    scale = Math.min(2.4, Math.max(.2, next));
    panX = originX - (originX - panX) * (scale / previous);
    panY = originY - (originY - panY) * (scale / previous);
    applyTransform();
  }

  nodeById.forEach((node, id) => {
    node.addEventListener('click', (event) => {
      event.stopPropagation();
      selectScreen(id);
    });
    node.addEventListener('dblclick', () => {
      if (data.screenUrls?.[id]) window.location.href = data.screenUrls[id];
    });
    node.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (selected === id && data.screenUrls?.[id]) window.location.href = data.screenUrls[id];
        else selectScreen(id);
      }
    });
  });
  stage.addEventListener('click', (event) => {
    if (event.target === stage || event.target === viewport || event.target === nodesLayer) selectScreen('');
  });
  stage.addEventListener('wheel', (event) => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const box = stage.getBoundingClientRect();
    setScale(scale * (event.deltaY > 0 ? .9 : 1.1), event.clientX - box.left, event.clientY - box.top);
  }, { passive: false });
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('[data-screen-node]')) return;
    dragging = true;
    dragStart = { x: event.clientX, y: event.clientY, panX, panY };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add('is-panning');
  });
  stage.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    panX = dragStart.panX + event.clientX - dragStart.x;
    panY = dragStart.panY + event.clientY - dragStart.y;
    applyTransform();
  });
  stage.addEventListener('pointerup', () => {
    dragging = false;
    stage.classList.remove('is-panning');
  });
  stage.addEventListener('keydown', (event) => {
    if (event.target.matches('input,select')) return;
    if (event.key === '+' || event.key === '=') setScale(scale * 1.1);
    if (event.key === '-') setScale(scale * .9);
    if (event.key === '0') fitToStage();
    if (event.key === 'Escape') selectScreen('');
  });
  workspace.querySelectorAll('[data-map-mode]').forEach((button) => button.addEventListener('click', () => {
    mode = button.dataset.mapMode;
    workspace.querySelectorAll('[data-map-mode]').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('is-active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    moduleSelect.hidden = mode !== 'module';
    useCaseSelect.hidden = mode !== 'usecase';
    render({ fit: true });
  }));
  moduleSelect?.addEventListener('change', () => render({ fit: true }));
  useCaseSelect?.addEventListener('change', () => render({ fit: true }));
  statusSelect?.addEventListener('change', () => render({ fit: true }));
  search?.addEventListener('input', () => render({ fit: true }));
  workspace.querySelector('[data-map-zoom-in]')?.addEventListener('click', () => setScale(scale * 1.1));
  workspace.querySelector('[data-map-zoom-out]')?.addEventListener('click', () => setScale(scale * .9));
  workspace.querySelector('[data-map-fit]')?.addEventListener('click', fitToStage);
  workspace.querySelector('[data-map-reset]')?.addEventListener('click', () => {
    scale = 1; panX = 24; panY = 24; applyTransform();
  });
  workspace.querySelector('[data-map-fullscreen]')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else stage.requestFullscreen?.();
  });

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (hash.get('usecase')) {
    mode = 'usecase';
    useCaseSelect.value = hash.get('usecase');
    useCaseSelect.hidden = false;
    workspace.querySelectorAll('[data-map-mode]').forEach((button) => {
      const active = button.dataset.mapMode === 'usecase';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  render({ fit: true });
  if (hash.get('screen')) selectScreen(hash.get('screen'));
})();
