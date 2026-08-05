(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const normalize = (value) => String(value || '')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const rootPrefix = () => document.body.dataset.rootPrefix || '';
  const scriptLoads = new Map();

  function loadScript(name) {
    if (scriptLoads.has(name)) return scriptLoads.get(name);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${rootPrefix()}assets/${name}`;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Не удалось загрузить ${name}`));
      document.head.append(script);
    }).catch((error) => {
      scriptLoads.delete(name);
      throw error;
    });
    scriptLoads.set(name, promise);
    return promise;
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

  function initializeSidebar(signal) {
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
      const containsActivePage = Boolean($('.is-active', folder));
      const hasSavedState = Object.prototype.hasOwnProperty.call(folderState, key);
      setCollapsed(containsActivePage ? false : (hasSavedState ? folderState[key] === true : true), false);
      folderToggle?.addEventListener('click', (event) => {
        event.stopPropagation();
        setCollapsed(!folder.classList.contains('is-collapsed'));
      }, { signal });
    });
    toggle?.addEventListener('click', (event) => {
      event.stopPropagation();
      const open = document.body.classList.toggle('sidebar-open');
      toggle.setAttribute('aria-expanded', String(open));
    }, { signal });
    document.addEventListener('click', (event) => {
      if (!document.body.classList.contains('sidebar-open')) return;
      if (event.target.closest('.sidebar') || event.target.closest('[data-sidebar-toggle]')) return;
      document.body.classList.remove('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'false');
    }, { signal });
    $$('.sidebar a').forEach((link) => link.addEventListener('click', () => {
      document.body.classList.remove('sidebar-open');
      toggle?.setAttribute('aria-expanded', 'false');
    }, { signal }));
    $('.nav-link.is-active, .nav-folder-link.is-active')?.scrollIntoView({ block: 'center' });
  }

  function initializeGlobalSearch() {
    const input = $('[data-global-search]');
    const results = $('[data-search-results]');
    if (!input || !results) return;
    let selected = -1;
    let currentItems = [];
    let index = Array.isArray(window.PROJECT_DOCS_SEARCH_INDEX) ? window.PROJECT_DOCS_SEARCH_INDEX : [];

    async function ensureIndex() {
      if (!Array.isArray(window.PROJECT_DOCS_SEARCH_INDEX)) {
        await loadScript('search-index.js');
      }
      index = Array.isArray(window.PROJECT_DOCS_SEARCH_INDEX) ? window.PROJECT_DOCS_SEARCH_INDEX : [];
      return index;
    }

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
          link.href = `${rootPrefix()}${item.url}`;
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

    input.addEventListener('input', async () => { await ensureIndex(); render(); });
    input.addEventListener('focus', async () => { await ensureIndex(); if (input.value.trim()) render(); });
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
        section.insertBefore(toggle, body);
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

  function initializeDiagramViewport({ stage, target, zoomIn, zoomOut, fitButton, fullscreenButton, signal }) {
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
    }, { signal });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !stage.classList.contains('is-fullscreen-fallback')) return;
      stage.classList.remove('is-fullscreen-fallback');
      updateFullscreenButton();
      fit();
    }, { signal });
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

  function initializeMermaid(signal) {
    const containers = $$('[data-mermaid-container]').filter((container) => $('[data-mermaid-diagram]', container));
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
        signal,
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
    let started = false;
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
      started = true;
      const render = async () => {
        try {
          if (!window.mermaid) await loadScript('mermaid.tiny.js');
          await renderAll();
        } catch {
          containers.forEach(showError);
        }
      };
      renderQueue = renderQueue.then(render, render);
    };
    document.addEventListener('docu-docu:themechange', () => { if (started) scheduleRender(); }, { signal });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        scheduleRender();
      }, { rootMargin: '320px 0px' });
      containers.forEach((container) => observer.observe(container));
      signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    } else {
      window.setTimeout(scheduleRender, 0);
    }
  }

  function initializeTocTracking(signal) {
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
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  }

  function initializeUseCaseTabs(signal) {
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
        activePanel?.dispatchEvent(new CustomEvent('docu-docu:panelshown', { bubbles: true }));
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
      window.addEventListener('hashchange', () => activate(window.location.hash.slice(1)), { signal });
      window.addEventListener('popstate', () => activate(window.location.hash.slice(1)), { signal });
      activate(window.location.hash.slice(1));
    });
  }

  function initializePrint() {
    $('[data-print]')?.addEventListener('click', () => window.print());
  }

  async function initializePage(signal) {
    initializeHeroSummary();
    initializeSidebar(signal);
    initializeCollectionFilters();
    initializeTaskFilters();
    initializeCollapsibleSections();
    initializeDocumentContextCopy();
    initializeCodeCopy();
    initializeMermaid(signal);
    initializeUseCaseTabs(signal);
    initializeTocTracking(signal);
    if ($('[data-screen-map]')) {
      await loadScript('screen-map.js').catch(() => {});
      if (!signal.aborted) window.DocuDocuInitializeScreenMap?.(document, signal);
    }
    if ($('[data-playable-flow]')) {
      await loadScript('playable-flow.js').catch(() => {});
      if (!signal.aborted) window.DocuDocuInitializePlayableFlow?.(document, signal);
    }
  }

  let pageController = new AbortController();
  initializeGlobalSearch();
  initializePrint();
  initializePage(pageController.signal);
  document.addEventListener('docu-docu:pagechange', () => {
    pageController.abort();
    pageController = new AbortController();
    initializePage(pageController.signal);
  });
})();
