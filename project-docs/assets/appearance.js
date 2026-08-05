(() => {
  'use strict';

  const root = document.documentElement;
  const script = document.currentScript;
  const media = matchMedia('(prefers-color-scheme: dark)');
  const definitions = {
    siteTheme: { attribute: 'siteTheme', key: 'docu-docu-site-theme', values: ['classic', 'paper', 'terminal'], fallback: 'classic' },
    colorScheme: { attribute: 'colorScheme', key: 'docu-docu-color-scheme', values: ['system', 'light', 'dark'], fallback: 'system' },
    accent: { attribute: 'accent', key: 'docu-docu-accent', values: ['indigo', 'blue', 'green', 'amber', 'rose'], fallback: 'indigo' },
    density: { attribute: 'density', key: 'docu-docu-density', values: ['comfortable', 'compact'], fallback: 'comfortable' },
    contentWidth: { attribute: 'contentWidth', key: 'docu-docu-content-width', values: ['narrow', 'standard', 'wide'], fallback: 'standard' },
  };
  const state = {};

  const stored = (definition, name) => {
    let value = root.dataset[definition.attribute] || script?.dataset[`default${name[0].toUpperCase()}${name.slice(1)}`] || definition.fallback;
    try { value = localStorage.getItem(definition.key) || value; } catch { /* privacy mode */ }
    return definition.values.includes(value) ? value : definition.fallback;
  };

  Object.entries(definitions).forEach(([name, definition]) => { state[name] = stored(definition, name); });

  function syncControls() {
    document.querySelectorAll('[data-site-theme-select]').forEach((select) => { select.value = state.siteTheme; });
    document.querySelectorAll('[data-color-scheme-select]').forEach((select) => { select.value = state.colorScheme; });
    const themeLabels = { classic: 'Классика', paper: 'Бумага', terminal: 'Терминал' };
    const indicators = { classic: 'C', paper: 'P', terminal: 'T' };
    const schemeLabels = { system: 'Система', light: 'Светлая', dark: 'Тёмная' };
    document.querySelectorAll('[data-site-theme-label]').forEach((node) => { node.textContent = themeLabels[state.siteTheme]; });
    document.querySelectorAll('[data-site-theme-indicator]').forEach((node) => { node.textContent = indicators[state.siteTheme]; });
    document.querySelectorAll('[data-theme-label]').forEach((node) => { node.textContent = schemeLabels[state.colorScheme]; });
  }

  function apply(announce = true) {
    Object.entries(definitions).forEach(([name, definition]) => { root.dataset[definition.attribute] = state[name]; });
    const resolved = state.colorScheme === 'system' ? (media.matches ? 'dark' : 'light') : state.colorScheme;
    root.dataset.theme = resolved;
    syncControls();
    if (announce) document.dispatchEvent(new CustomEvent('docu-docu:themechange', { detail: { ...state, mode: state.colorScheme, theme: resolved } }));
  }

  function bind() {
    document.querySelectorAll('[data-site-theme-select]').forEach((select) => select.addEventListener('change', () => set('siteTheme', select.value)));
    document.querySelectorAll('[data-color-scheme-select]').forEach((select) => select.addEventListener('change', () => set('colorScheme', select.value)));
    syncControls();
  }

  function set(name, value) {
    const definition = definitions[name];
    if (!definition?.values.includes(value)) return;
    state[name] = value;
    try { localStorage.setItem(definition.key, value); } catch { /* privacy mode */ }
    apply();
  }

  apply(false);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true }); else bind();
  media.addEventListener?.('change', () => { if (state.colorScheme === 'system') apply(); });
  window.DocuDocuAppearance = { get: () => ({ ...state, theme: root.dataset.theme }), set, apply };
})();
