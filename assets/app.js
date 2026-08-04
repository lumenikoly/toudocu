(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalize = (value) => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const rootPrefix = document.body.dataset.rootPrefix || '';

  function initializeTheme() {
    const select = $('[data-color-scheme-select]');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    let mode = document.documentElement.dataset.colorScheme || 'system';

    const apply = (announce = true) => {
      const resolved = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
      document.documentElement.dataset.colorScheme = mode;
      document.documentElement.dataset.theme = resolved;
      const labels = { system: 'Система', light: 'Светлая', dark: 'Тёмная' };
      const label = $('[data-theme-label]', select?.closest('.header-select'));
      if (label) label.textContent = labels[mode];
      if (select) select.value = mode;
      if (announce) {
        document.dispatchEvent(new CustomEvent('docgent:themechange', { detail: { mode, theme: resolved } }));
      }
    };
    apply(false);

    select?.addEventListener('change', () => {
      mode = select.value;
      try { localStorage.setItem('docgent-color-scheme', mode); } catch { /* file:// privacy mode */ }
      apply();
    });
    media.addEventListener?.('change', () => {
      if (mode === 'system') apply();
    });
  }

  function initializeSiteTheme() {
    const select = $('[data-site-theme-select]');
    const labels = { classic: 'Классика', paper: 'Бумага', terminal: 'Терминал' };
    const indicators = { classic: 'C', paper: 'P', terminal: 'T' };
    let theme = document.documentElement.dataset.siteTheme || 'classic';

    const apply = (announce = true) => {
      document.documentElement.dataset.siteTheme = theme;
      const wrapper = select?.closest('.header-select');
      const label = $('[data-site-theme-label]', wrapper);
      const indicator = $('[data-site-theme-indicator]', wrapper);
      if (label) label.textContent = labels[theme];
      if (indicator) indicator.textContent = indicators[theme];
      if (select) select.value = theme;
      if (announce) {
        document.dispatchEvent(new CustomEvent('docgent:themechange', {
          detail: { siteTheme: theme, theme: document.documentElement.dataset.theme },
        }));
      }
    };
    apply(false);

    select?.addEventListener('change', () => {
      theme = select.value;
      try { localStorage.setItem('docgent-site-theme', theme); } catch { /* file:// privacy mode */ }
      apply();
    });
  }

  function initializeHeroSummary() {
    $$('[data-hero-summary]').forEach((summary) => {
      const text = $('p', summary);
      const button = $('[data-hero-summary-toggle]', summary);
      if (!text || !button) return;
      const fullHeight = text.scrollHeight;
      summary.classList.add('is-clampable');
      if (text.clientHeight + 1 >= fullHeight) {
        summary.classList.remove('is-clampable');
        return;
      }
      button.hidden = false;
      button.addEventListener('click', () => {
        const expanded = summary.classList.toggle('is-expanded');
        button.setAttribute('aria-expanded', String(expanded));
        button.textContent = expanded ? 'Свернуть' : 'Показать полностью';
      });
    });
  }

  function mermaidThemeConfig() {
    const styles = getComputedStyle(document.documentElement);
    const color = (name) => styles.getPropertyValue(name).trim();
    const dark = document.documentElement.dataset.theme === 'dark';
    return {
      theme: 'base',
      themeVariables: {
        darkMode: dark,
        background: color('--bg'),
        primaryColor: color('--surface-soft'),
        primaryTextColor: color('--text'),
        primaryBorderColor: color('--accent'),
        lineColor: color('--border-strong'),
        secondaryColor: color('--surface-strong'),
        tertiaryColor: color('--surface'),
        noteBkgColor: color('--accent-soft'),
        noteTextColor: color('--text'),
        fontFamily: color('--font-body'),
      },
    };
  }

  function initializeSidebar() {
    const toggle = $('[data-sidebar-toggle]');
    let folderState = {};
    try {
      const storedFolderState = JSON.parse(localStorage.getItem('project-docs-navigation') || '{}');
      if (storedFolderState && typeof storedFolderState === 'object' && !Array.isArray(storedFolderState)) {
        folderState = storedFolderState;
      }
    } catch { /* file:// privacy mode */ }
    $$('[data-nav-folder]').forEach((folder) => {
      const folderToggle = $('[data-nav-folder-toggle]', folder);
      const label = $('.nav-folder-link', folder)?.textContent.trim() || 'раздел';
      const key = folder.dataset.navFolder;
      const setCollapsed = (collapsed, persist = true) => {
        folder.classList.toggle('is-collapsed', collapsed);
        folderToggle?.setAttribute('aria-expanded', String(!collapsed));
        folderToggle?.setAttribute('aria-label', `${collapsed ? 'Развернуть' : 'Свернуть'} раздел ${label}`);
        if (folderToggle) folderToggle.title = folderToggle.getAttribute('aria-label');
        if (!persist) return;
        folderState[key] = collapsed;
        try { localStorage.setItem('project-docs-navigation', JSON.stringify(folderState)); } catch { /* file:// privacy mode */ }
      };
      setCollapsed(folderState[key] === true, false);
      folderToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        setCollapsed(!folder.classList.contains('is-collapsed'));
      });
    });
    toggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = document.body.classList.toggle('sidebar-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (event.target.closest('.sidebar') || event.target.closest('[data-sidebar-toggle]')) return;
      document.body.classList.remove('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
    $$('.sidebar a').forEach((link) => link.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'false');
    }));
    $('.nav-link.is-active, .nav-folder-link.is-active')?.scrollIntoView({ block: 'center' });
  }

  function initializeGlobalSearch() {
    const input = $('[data-global-search]');
    const results = $('[data-search-results]');
    const index = Array.isArray(window.PROJECT_DOCS_SEARCH_INDEX) ? window.PROJECT_DOCS_SEARCH_INDEX : [];
    if (!input || !results) return;
    let selected = -1;
    let currentItems = [];

    function score(item, query, terms) {
      const title = normalize(item.title);
      const path = normalize(item.path);
      const haystack = item.text || normalize(`${item.title} ${item.path} ${item.description} ${item.status} ${item.owner}`);
      if (!terms.every((term) => haystack.includes(term))) return -1;
      let value = 0;
      if (title === query) value += 120;
      if (title.startsWith(query)) value += 80;
      else if (title.includes(query)) value += 50;
      if (path.includes(query)) value += 24;
      for (const term of terms) {
        if (title.includes(term)) value += 15;
        if (path.includes(term)) value += 6;
      }
      return value;
    }

    function close() {
      results.hidden = true;
      results.replaceChildren();
      currentItems = [];
      selected = -1;
      input.setAttribute('aria-expanded', 'false');
    }

    function select(indexToSelect) {
      selected = Math.max(-1, Math.min(indexToSelect, currentItems.length - 1));
      $$('.search-result', results).forEach((element, itemIndex) => {
        element.classList.toggle('is-selected', itemIndex === selected);
        element.setAttribute('aria-selected', String(itemIndex === selected));
      });
      if (selected >= 0) $$('.search-result', results)[selected]?.scrollIntoView({ block: 'nearest' });
    }

    function render() {
      const query = normalize(input.value);
      results.replaceChildren();
      selected = -1;
      if (!query) {
        close();
        return;
      }
      const terms = query.split(' ').filter(Boolean);
      currentItems = index
        .map((item) => ({ item, score: score(item, query, terms) }))
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'ru'))
        .slice(0, 12)
        .map((entry) => entry.item);

      if (!currentItems.length) {
        const empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.textContent = 'Ничего не найдено';
        results.append(empty);
      } else {
        currentItems.forEach((item, itemIndex) => {
          const link = document.createElement('a');
          link.className = 'search-result';
          link.href = `${rootPrefix}${item.url}`;
          link.setAttribute('role', 'option');
          link.setAttribute('aria-selected', 'false');
          link.dataset.searchIndex = String(itemIndex);

          const title = document.createElement('span');
          title.className = 'search-result-title';
          title.textContent = item.title;
          const meta = document.createElement('span');
          meta.className = 'search-result-meta';
          meta.textContent = [item.typeLabel, item.status, item.path].filter(Boolean).join(' · ');
          link.append(title, meta);
          results.append(link);
        });
      }
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', () => { if (input.value.trim()) render(); });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        select(selected + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        select(selected <= 0 ? currentItems.length - 1 : selected - 1);
      } else if (event.key === 'Enter' && selected >= 0) {
        event.preventDefault();
        $$('.search-result', results)[selected]?.click();
      } else if (event.key === 'Escape') {
        close();
        input.blur();
      }
    });
    results.addEventListener('mousemove', (event) => {
      const link = event.target.closest('[data-search-index]');
      if (link) select(Number(link.dataset.searchIndex));
    });
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.global-search')) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  function initializeCollectionFilters() {
    $$('[data-filter-scope]').forEach((scope) => {
      const items = $$('[data-filter-item]', scope);
      const controls = $$('[data-filter-control]', scope);
      const resetButtons = $$('[data-filter-reset]', scope);
      const count = $('[data-filter-count]', scope);
      const empty = $('[data-filter-empty]', scope);
      if (!items.length || !controls.length) return;

      function apply() {
        const filters = {};
        controls.forEach((control) => {
          filters[control.dataset.filterControl] = normalize(control.value);
        });
        let visible = 0;
        items.forEach((item) => {
          const matches = Object.entries(filters).every(([key, value]) => {
            if (!value || value === 'all') return true;
            const itemValue = normalize(item.dataset[key] || '');
            if (key === 'search' || key === 'route') return itemValue.includes(value);
            if (key === 'usecase') {
              return String(item.dataset[key] || '').split('|').map(normalize).includes(value);
            }
            return itemValue === value;
          });
          item.hidden = !matches;
          if (matches) visible += 1;
        });
        if (count) count.textContent = `${visible} из ${items.length}`;
        if (empty) empty.hidden = visible !== 0;
      }

      controls.forEach((control) => {
        control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', apply);
      });
      resetButtons.forEach((button) => {
        button.addEventListener('click', () => {
          controls.forEach((control) => {
            control.value = control.dataset.filterDefault || (control.tagName === 'SELECT' ? 'all' : '');
          });
          apply();
          controls[0]?.focus();
        });
      });
      apply();
    });
  }

  function initializeTaskFilters() {
    const buttons = $$('[data-task-filter]');
    if (!buttons.length) return;
    function setFilter(value) {
      document.body.dataset.taskFilter = value;
      buttons.forEach((button) => {
        const active = button.dataset.taskFilter === value;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
    }
    buttons.forEach((button) => button.addEventListener('click', () => setFilter(button.dataset.taskFilter)));
    setFilter('all');
  }

  function initializeCollapsibleSections() {
    $$('.doc-content').forEach((content) => {
      const children = [...content.children];
      const h2Indexes = children.map((node, index) => node.tagName === 'H2' ? index : -1).filter((index) => index >= 0);
      if (!h2Indexes.length) return;

      for (let position = h2Indexes.length - 1; position >= 0; position -= 1) {
        const start = h2Indexes[position];
        const end = h2Indexes[position + 1] ?? children.length;
        const heading = children[start];
        if (!heading.parentNode || heading.closest('.doc-section')) continue;
        const section = document.createElement('section');
        section.className = 'doc-section';
        const body = document.createElement('div');
        body.className = 'section-body';
        heading.parentNode.insertBefore(section, heading);
        section.append(heading);
        for (let itemIndex = start + 1; itemIndex < end; itemIndex += 1) {
          const node = children[itemIndex];
          if (node.parentNode === content) body.append(node);
        }
        section.append(body);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'section-toggle';
        toggle.textContent = '▾';
        const headingTitle = heading.textContent.replace(/^#/, '').trim();
        section.dataset.sectionTitle = headingTitle;
        toggle.setAttribute('aria-label', `Свернуть раздел ${headingTitle}`);
        toggle.setAttribute('aria-expanded', 'true');
        toggle.addEventListener('click', () => {
          const collapsed = section.classList.toggle('is-collapsed');
          toggle.setAttribute('aria-expanded', String(!collapsed));
          toggle.setAttribute('aria-label', `${collapsed ? 'Развернуть' : 'Свернуть'} раздел ${headingTitle}`);
          updateCollapseAllButton();
        });
        heading.append(toggle);
      }
    });

    const collapseAllButton = $('[data-collapse-all]');
    const sections = $$('.doc-section');
    function updateCollapseAllButton() {
      if (!collapseAllButton) return;
      const hasExpandedSections = sections.some((section) => !section.classList.contains('is-collapsed'));
      collapseAllButton.dataset.collapseState = hasExpandedSections ? 'expanded' : 'collapsed';
      collapseAllButton.setAttribute('aria-expanded', String(hasExpandedSections));
      const label = $('[data-collapse-label]', collapseAllButton);
      if (label) label.textContent = hasExpandedSections ? 'Свернуть разделы' : 'Развернуть разделы';
    }
    if (collapseAllButton && !sections.length) collapseAllButton.hidden = true;
    collapseAllButton?.addEventListener('click', () => {
      const shouldCollapse = sections.some((section) => !section.classList.contains('is-collapsed'));
      sections.forEach((section) => {
        section.classList.toggle('is-collapsed', shouldCollapse);
        const toggle = $('.section-toggle', section);
        if (!toggle) return;
        toggle.setAttribute('aria-expanded', String(!shouldCollapse));
        const headingTitle = section.dataset.sectionTitle || '';
        toggle.setAttribute('aria-label', `${shouldCollapse ? 'Развернуть' : 'Свернуть'} раздел ${headingTitle}`);
      });
      updateCollapseAllButton();
    });
    updateCollapseAllButton();
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch { /* file:// and browser permission fallback */ }
    }

    const activeElement = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.inset = '0 auto auto -9999px';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    } catch { /* unsupported fallback */ }
    textarea.remove();
    activeElement?.focus?.();
    return copied;
  }

  function initializeDocumentContextCopy() {
    $$('[data-copy-document-context]').forEach((button) => {
      const label = $('[data-copy-document-context-label]', button);
      const title = button.dataset.documentContextTitle || '';
      const path = button.dataset.documentContextPath || '';
      let resetTimer = 0;
      button.addEventListener('click', async () => {
        window.clearTimeout(resetTimer);
        const copied = await copyText(`Документ: ${title}\nПуть: ${path}`);
        button.dataset.copyState = copied ? 'success' : 'error';
        if (label) label.textContent = copied ? 'Скопировано' : 'Не удалось скопировать';
        resetTimer = window.setTimeout(() => {
          delete button.dataset.copyState;
          if (label) label.textContent = 'Копировать контекст';
        }, copied ? 1300 : 2200);
      });
    });
  }

  function initializeCodeCopy() {
    $$('.code-block').forEach((block) => {
      const code = $('code', block);
      if (!code) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy-code';
      button.textContent = 'Копировать';
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent || '');
          button.textContent = 'Скопировано';
          window.setTimeout(() => { button.textContent = 'Копировать'; }, 1300);
        } catch {
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          button.textContent = 'Выделено';
        }
      });
      block.append(button);
    });
  }

  function initializeDiagramViewport({ stage, target, zoomIn, zoomOut, fitButton, fullscreenButton }) {
    if (!stage || !target) return null;
    let view = { scale: 1, x: 0, y: 0 };
    let dragging = null;
    let nativeFullscreen = false;

    function applyTransform() {
      const svg = $('svg', target);
      if (!svg) return;
      svg.style.transformOrigin = 'center center';
      svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }

    function fit() {
      view = { scale: 1, x: 0, y: 0 };
      applyTransform();
    }

    function updateFullscreenButton() {
      if (!fullscreenButton) return;
      const expanded = document.fullscreenElement === stage || stage.classList.contains('is-fullscreen-fallback');
      fullscreenButton.textContent = expanded ? 'Выйти' : 'На весь экран';
      fullscreenButton.setAttribute('aria-label', expanded ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран');
    }

    zoomIn?.addEventListener('click', () => {
      view.scale = Math.min(3, view.scale + 0.15);
      applyTransform();
    });
    zoomOut?.addEventListener('click', () => {
      view.scale = Math.max(0.45, view.scale - 0.15);
      applyTransform();
    });
    fitButton?.addEventListener('click', fit);
    fullscreenButton?.addEventListener('click', async () => {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
      } else if (stage.classList.contains('is-fullscreen-fallback')) {
        stage.classList.remove('is-fullscreen-fallback');
      } else if (stage.requestFullscreen) {
        try {
          await stage.requestFullscreen();
        } catch {
          stage.classList.add('is-fullscreen-fallback');
        }
      } else {
        stage.classList.add('is-fullscreen-fallback');
      }
      updateFullscreenButton();
      fit();
    });
    document.addEventListener('fullscreenchange', () => {
      const expanded = document.fullscreenElement === stage;
      if (!expanded && !nativeFullscreen) return;
      nativeFullscreen = expanded;
      updateFullscreenButton();
      fit();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !stage.classList.contains('is-fullscreen-fallback')) return;
      stage.classList.remove('is-fullscreen-fallback');
      updateFullscreenButton();
      fit();
    });
    stage.addEventListener('wheel', (event) => {
      if (!event.target.closest('svg')) return;
      event.preventDefault();
      view.scale = Math.max(0.45, Math.min(3, view.scale + (event.deltaY < 0 ? 0.1 : -0.1)));
      applyTransform();
    }, { passive: false });
    stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.target.closest('svg')) return;
      dragging = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('is-panning');
    });
    stage.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      view.x = dragging.originX + event.clientX - dragging.x;
      view.y = dragging.originY + event.clientY - dragging.y;
      applyTransform();
    });
    const stopPan = () => {
      dragging = null;
      stage.classList.remove('is-panning');
    };
    stage.addEventListener('pointerup', stopPan);
    stage.addEventListener('pointercancel', stopPan);
    updateFullscreenButton();

    return { fit };
  }

  function initializeMermaid() {
    const containers = $$('[data-mermaid-container]').filter((container) => $('[data-mermaid-diagram]', container) && !container.matches('[data-screen-map-diagram]'));
    if (!containers.length) return;
    const viewports = new Map();
    containers.forEach((container) => {
      const viewport = initializeDiagramViewport({
        stage: $('[data-mermaid-stage]', container),
        target: $('[data-mermaid-diagram]', container),
        zoomIn: $('[data-mermaid-zoom-in]', container),
        zoomOut: $('[data-mermaid-zoom-out]', container),
        fitButton: $('[data-mermaid-fit]', container),
        fullscreenButton: $('[data-mermaid-fullscreen]', container),
      });
      if (viewport) viewports.set(container, viewport);
    });

    const showError = (container) => {
      container.classList.add('has-error');
      const target = $('[data-mermaid-diagram]', container);
      const error = $('[data-mermaid-error]', container);
      if (target) target.replaceChildren();
      if (error) error.hidden = false;
    };

    let renderQueue = Promise.resolve();
    const renderAll = async () => {
      if (!window.mermaid) {
        containers.forEach(showError);
        return;
      }
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering'],
        maxTextSize: 50000,
        suppressErrorRendering: true,
        ...mermaidThemeConfig(),
      });
      for (const container of containers) {
        const target = $('[data-mermaid-diagram]', container);
        const source = $('.mermaid-source code', container)?.textContent || '';
        const error = $('[data-mermaid-error]', container);
        if (!target) continue;
        container.classList.remove('has-error');
        if (error) error.hidden = true;
        target.removeAttribute('data-processed');
        target.textContent = source;
        try {
          await window.mermaid.run({ nodes: [target] });
          viewports.get(container)?.fit();
        } catch {
          showError(container);
        }
      }
    };
    const scheduleRender = () => {
      renderQueue = renderQueue.then(renderAll, renderAll);
    };
    document.addEventListener('docgent:themechange', scheduleRender);
    scheduleRender();
  }

  function initializeScreenMap() {
    const workspace = $('[data-screen-map]');
    if (!workspace) return;
    const dataElement = $('[data-screen-map-data]', workspace);
    const diagram = $('[data-screen-map-diagram]', workspace);
    const target = $('[data-mermaid-diagram]', diagram);
    const sourceCode = $('.mermaid-source code', diagram);
    const error = $('[data-mermaid-error]', diagram);
    const stage = $('[data-screen-map-stage]', workspace);
    const message = $('[data-screen-map-message]', workspace);
    const moduleControl = $('[data-screen-module-control]', workspace);
    const moduleSelect = $('[data-screen-module]', workspace);
    const pathControls = $('[data-screen-path-controls]', workspace);
    const pathFrom = $('[data-screen-path-from]', workspace);
    const pathTo = $('[data-screen-path-to]', workspace);
    if (!dataElement || !diagram || !target || !stage) return;

    let data;
    try {
      data = JSON.parse(dataElement.textContent || '{}');
    } catch {
      if (error) error.hidden = false;
      return;
    }
    const screens = Array.isArray(data.screens) ? data.screens : [];
    const transitions = Array.isArray(data.transitions) ? data.transitions : [];
    const modules = data.modules && typeof data.modules === 'object' ? data.modules : {};
    const nodeIds = new Map(screens.map((screen, index) => [screen.id, `n${index}`]));
    let mode = 'all';
    let selected = '';
    let renderQueue = Promise.resolve();
    const viewport = initializeDiagramViewport({
      stage,
      target,
      zoomIn: $('[data-screen-zoom-in]', workspace),
      zoomOut: $('[data-screen-zoom-out]', workspace),
      fitButton: $('[data-screen-fit]', workspace),
      fullscreenButton: $('[data-screen-fullscreen]', workspace),
    });

    const mermaidText = (value) => String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/[\r\n]+/g, ' ')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    function reachable(start, reverse = false) {
      const adjacency = new Map();
      transitions.forEach((transition) => {
        const from = reverse ? transition.toId : transition.fromId;
        const to = reverse ? transition.fromId : transition.toId;
        if (!adjacency.has(from)) adjacency.set(from, []);
        adjacency.get(from).push(to);
      });
      const result = new Set();
      const queue = start ? [start] : [];
      while (queue.length) {
        const current = queue.shift();
        if (result.has(current)) continue;
        result.add(current);
        (adjacency.get(current) || []).forEach((next) => queue.push(next));
      }
      return result;
    }

    function visibleScreens() {
      if (mode === 'module') {
        return new Set(screens.filter((screen) => screen.moduleId === moduleSelect?.value).map((screen) => screen.id));
      }
      if (mode === 'unfinished') {
        return new Set(screens.filter((screen) => ['planned', 'in-progress'].includes(screen.status?.kind)).map((screen) => screen.id));
      }
      if (mode === 'path' && pathFrom?.value && pathTo?.value) {
        const forward = reachable(pathFrom.value);
        if (!forward.has(pathTo.value)) {
          if (message) message.textContent = 'Между выбранными экранами нет пути.';
          return new Set();
        }
        const backward = reachable(pathTo.value, true);
        if (message) message.textContent = 'Показаны все ветки, ведущие от начального экрана к конечному.';
        return new Set([...forward].filter((id) => backward.has(id)));
      }
      if (message) message.textContent = mode === 'path' ? 'Выберите начальный и конечный экраны.' : '';
      return new Set(screens.map((screen) => screen.id));
    }

    function sourceFor(visible) {
      const grouped = new Map();
      screens.forEach((screen) => {
        if (!visible.has(screen.id)) return;
        if (!grouped.has(screen.moduleId)) grouped.set(screen.moduleId, []);
        grouped.get(screen.moduleId).push(screen);
      });
      const lines = ['flowchart LR'];
      [...grouped.entries()].forEach(([moduleId, items], moduleIndex) => {
        const title = modules[moduleId] ? `${moduleId} · ${modules[moduleId]}` : moduleId;
        lines.push(`    subgraph module${moduleIndex}["${mermaidText(title)}"]`);
        lines.push('        direction LR');
        items.forEach((screen) => {
          const label = `${mermaidText(screen.id)}<br/>${mermaidText(screen.title)}`;
          lines.push(screen.kind === 'modal'
            ? `        ${nodeIds.get(screen.id)}("${label}")`
            : `        ${nodeIds.get(screen.id)}["${label}"]`);
        });
        lines.push('    end');
      });
      transitions.forEach((transition) => {
        if (!visible.has(transition.fromId) || !visible.has(transition.toId)) return;
        const label = transition.condition ? `${transition.action} · ${transition.condition}` : transition.action;
        const arrow = transition.kind === 'redirect' ? '-.->' : '-->';
        lines.push(`    ${nodeIds.get(transition.fromId)} ${arrow}|"${mermaidText(label)}"| ${nodeIds.get(transition.toId)}`);
      });
      screens.forEach((screen) => {
        if (!visible.has(screen.id)) return;
        const classes = ['screenNode', `node-${nodeIds.get(screen.id)}`];
        if (screen.status?.kind === 'done') classes.push('screenDone');
        if (screen.status?.kind === 'in-progress') classes.push('screenProgress');
        if (screen.status?.kind === 'planned') classes.push('screenPlanned');
        if (screen.id === selected) classes.push('screenSelected');
        classes.forEach((className) => lines.push(`    class ${nodeIds.get(screen.id)} ${className}`));
      });
      lines.push(
        '    classDef screenNode stroke-width:1.5px',
        '    classDef screenDone stroke:#23825f',
        '    classDef screenProgress stroke:#b97816',
        '    classDef screenPlanned stroke:#65758b',
        '    classDef screenSelected stroke:#1665d8,stroke-width:4px'
      );
      return lines.join('\n');
    }

    function bindNodes() {
      screens.forEach((screen) => {
        const node = $(`.node-${nodeIds.get(screen.id)}`, target);
        if (!node) return;
        node.classList.add('screen-map-node');
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', `${screen.id}: ${screen.title}`);
        const choose = (event) => {
          event.stopPropagation();
          selectScreen(screen.id, true);
        };
        node.addEventListener('click', choose);
        node.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            choose(event);
          }
        });
      });
    }

    async function renderNow() {
      const visible = visibleScreens();
      const source = sourceFor(visible);
      if (sourceCode) sourceCode.textContent = source;
      if (!window.mermaid) {
        if (error) error.hidden = false;
        return;
      }
      window.mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering'],
        maxTextSize: 50000,
        suppressErrorRendering: true,
        ...mermaidThemeConfig(),
      });
      diagram.classList.remove('has-error');
      if (error) error.hidden = true;
      target.removeAttribute('data-processed');
      target.textContent = source;
      try {
        await window.mermaid.run({ nodes: [target] });
        viewport?.fit();
        bindNodes();
      } catch {
        diagram.classList.add('has-error');
        target.replaceChildren();
        if (error) error.hidden = false;
      }
    }

    function scheduleRender() {
      renderQueue = renderQueue.then(renderNow, renderNow);
    }

    function selectScreen(id, scrollToRow = false) {
      selected = id;
      $$('[data-screen-row]').forEach((row) => row.classList.toggle('is-selected', row.dataset.screenRow === id));
      if (scrollToRow) {
        $(`[data-screen-row="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      scheduleRender();
    }

    $$('[data-screen-mode]', workspace).forEach((button) => {
      button.addEventListener('click', () => {
        mode = button.dataset.screenMode;
        $$('[data-screen-mode]', workspace).forEach((candidate) => {
          const active = candidate === button;
          candidate.classList.toggle('is-active', active);
          candidate.setAttribute('aria-pressed', String(active));
        });
        if (moduleControl) moduleControl.hidden = mode !== 'module';
        if (pathControls) pathControls.hidden = mode !== 'path';
        scheduleRender();
      });
    });
    moduleSelect?.addEventListener('change', scheduleRender);
    pathFrom?.addEventListener('change', scheduleRender);
    pathTo?.addEventListener('change', scheduleRender);
    $$('[data-screen-select]').forEach((button) => button.addEventListener('click', () => selectScreen(button.dataset.screenSelect, false)));

    const hashRow = $$('[data-screen-row]').find((row) => `#${row.id}` === window.location.hash);
    if (hashRow) {
      selected = hashRow.dataset.screenRow;
      hashRow.classList.add('is-selected');
    }
    document.addEventListener('docgent:themechange', scheduleRender);
    scheduleRender();
  }

  function initializeTocTracking() {
    const links = $$('.page-toc a[href^="#"]');
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));
    const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!visible) return;
      links.forEach((link) => link.classList.toggle('is-active', link === byId.get(visible.target.id)));
    }, { rootMargin: '-80px 0px -70% 0px', threshold: 0 });
    headings.forEach((heading) => observer.observe(heading));
  }

  function initializeUseCaseTabs() {
    $$('[data-usecase-tabs]').forEach((container) => {
      const tabs = $$('[data-usecase-tab]', container);
      const panels = $$('[data-usecase-panel]', container);
      if (!tabs.length || !panels.length) return;
      const ids = new Set(panels.map((panel) => panel.id));
      container.classList.add('is-enhanced');

      function activate(id, updateHistory = false) {
        const targetID = ids.has(id) ? id : 'overview';
        tabs.forEach((tab) => {
          const active = tab.dataset.usecaseTab === targetID;
          tab.classList.toggle('is-active', active);
          tab.setAttribute('aria-selected', String(active));
          tab.tabIndex = active ? 0 : -1;
        });
        panels.forEach((panel) => {
          panel.hidden = panel.id !== targetID;
        });
        const activePanel = panels.find((panel) => panel.id === targetID);
        activePanel?.dispatchEvent(new CustomEvent('docgent:panelshown', { bubbles: true }));
        if (updateHistory && window.location.hash !== `#${targetID}`) {
          window.history.pushState(null, '', `#${targetID}`);
        }
      }

      tabs.forEach((tab, index) => {
        tab.addEventListener('click', (event) => {
          event.preventDefault();
          activate(tab.dataset.usecaseTab, true);
        });
        tab.addEventListener('keydown', (event) => {
          let next = index;
          if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
          else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
          else if (event.key === 'Home') next = 0;
          else if (event.key === 'End') next = tabs.length - 1;
          else return;
          event.preventDefault();
          tabs[next].focus();
          activate(tabs[next].dataset.usecaseTab, true);
        });
      });
      window.addEventListener('hashchange', () => activate(window.location.hash.slice(1)));
      window.addEventListener('popstate', () => activate(window.location.hash.slice(1)));
      activate(window.location.hash.slice(1));
    });
  }

  function initializePrint() {
    $('[data-print]')?.addEventListener('click', () => window.print());
  }

  initializeTheme();
  initializeSiteTheme();
  initializeHeroSummary();
  initializeSidebar();
  initializeGlobalSearch();
  initializeCollectionFilters();
  initializeTaskFilters();
  initializeCollapsibleSections();
  initializeDocumentContextCopy();
  initializeCodeCopy();
  initializeMermaid();
  initializeUseCaseTabs();
  initializeTocTracking();
  initializePrint();
})();
