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
    const button = $('[data-theme-toggle]');
    let stored = null;
    try { stored = localStorage.getItem('project-docs-theme'); } catch { /* file:// privacy mode */ }
    const preferred = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = preferred;

    const updateButton = () => {
      if (!button) return;
      const dark = document.documentElement.dataset.theme === 'dark';
      button.textContent = dark ? '☀' : '☾';
      button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
      button.title = button.getAttribute('aria-label');
    };
    updateButton();

    button?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('project-docs-theme', next); } catch { /* ignore */ }
      updateButton();
    });
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
            return key === 'search' ? itemValue.includes(value) : itemValue === value;
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

  function initializePrint() {
    $('[data-print]')?.addEventListener('click', () => window.print());
  }

  initializeTheme();
  initializeSidebar();
  initializeGlobalSearch();
  initializeCollectionFilters();
  initializeTaskFilters();
  initializeCollapsibleSections();
  initializeCodeCopy();
  initializeTocTracking();
  initializePrint();
})();
