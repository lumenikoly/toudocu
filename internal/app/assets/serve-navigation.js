(() => {
  'use strict';

  const revisionSelector = 'meta[name="docu-docu-revision"]';
  const cache = new Map();
  const maxCacheEntries = 8;
  let prefetchTimer = 0;
  let navigating = false;

  const currentRevision = () => document.querySelector(revisionSelector)?.content || '';
  const canonicalURL = (value) => {
    const url = new URL(value, window.location.href);
    url.hash = '';
    return url.href;
  };

  function isCanonicalLink(link, event) {
    if (!link || !link.href || link.hasAttribute('download') || link.target) return false;
    if (event && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return false;
    const raw = link.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return false;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !/^https?:$/.test(url.protocol)) return false;
    if (url.pathname.startsWith('/_docu-docu/') || url.pathname.startsWith('/changes/') || url.pathname.startsWith('/api/')) return false;
    if (/^\/[a-z]{2}(?:-[A-Z]{2})?\//.test(url.pathname)) return false;
    if (!url.pathname.endsWith('/') && !url.pathname.endsWith('.html')) return false;
    return true;
  }

  function touchCache(key, value) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
  }

  async function fetchPage(url) {
    const key = canonicalURL(url);
    if (cache.has(key)) {
      const cached = cache.get(key);
      touchCache(key, cached);
      return cached;
    }
    const request = fetch(key, { headers: { Accept: 'text/html' }, credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error(`HTTP ${response.status}`);
        const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
        const revision = parsed.querySelector(revisionSelector)?.content || '';
        if (!revision || !parsed.querySelector('[data-docu-docu-serve-navigation]') || !parsed.querySelector('.site-layout')) {
          throw new Error('not a canonical serve page');
        }
        if (revision !== currentRevision()) {
          cache.clear();
          throw new Error('serve revision changed');
        }
        return parsed;
      })
      .catch((error) => {
        cache.delete(key);
        throw error;
      });
    touchCache(key, request);
    return request;
  }

  function setBusy(busy) {
    document.documentElement.classList.toggle('is-soft-navigating', busy);
    document.querySelector('main')?.setAttribute('aria-busy', String(busy));
  }

  function replaceOptional(selector, nextDocument) {
    const current = document.querySelector(selector);
    const next = nextDocument.querySelector(selector);
    if (current && next) current.replaceWith(next.cloneNode(true));
    else if (current && !next) current.remove();
  }

  function syncPageStyles(nextDocument, pageURL) {
    document.querySelectorAll('link[data-page-style]').forEach((link) => link.remove());
    nextDocument.querySelectorAll('link[data-page-style]').forEach((link) => {
      const clone = link.cloneNode(true);
      clone.href = new URL(link.getAttribute('href'), pageURL).href;
      document.head.append(clone);
    });
  }

  function scrollToTarget(url, restoreScroll) {
    if (url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      const target = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
      target?.scrollIntoView();
      return;
    }
    if (restoreScroll) window.scrollTo(restoreScroll.x || 0, restoreScroll.y || 0);
    else window.scrollTo(0, 0);
  }

  async function navigate(value, { historyMode = 'push', restoreScroll = null } = {}) {
    const url = new URL(value, window.location.href);
    if (navigating) return;
    navigating = true;
    setBusy(true);
    try {
      const nextDocument = await fetchPage(url);
      const nextLayout = nextDocument.querySelector('.site-layout');
      document.querySelector('.site-layout').replaceWith(nextLayout.cloneNode(true));
      document.title = nextDocument.title;
      document.documentElement.lang = nextDocument.documentElement.lang;
      document.body.dataset.rootPrefix = nextDocument.body.dataset.rootPrefix || '';
      const description = nextDocument.querySelector('meta[name="description"]')?.content || '';
      document.querySelector('meta[name="description"]')?.setAttribute('content', description);
      const favicon = nextDocument.querySelector('link[rel="icon"]')?.getAttribute('href');
      if (favicon) document.querySelector('link[rel="icon"]')?.setAttribute('href', new URL(favicon, url).href);
      const nextBrand = nextDocument.querySelector('.brand');
      const brand = document.querySelector('.brand');
      if (brand && nextBrand) {
        brand.setAttribute('href', new URL(nextBrand.getAttribute('href'), url).href);
        brand.innerHTML = nextBrand.innerHTML;
      }
      replaceOptional('.language-select', nextDocument);
      syncPageStyles(nextDocument, url);
      document.body.classList.remove('sidebar-open');
      if (historyMode === 'push') history.pushState({ docuDocu: true, scrollX: 0, scrollY: 0 }, '', url);
      document.dispatchEvent(new CustomEvent('docu-docu:pagechange', { detail: { url: url.href } }));
      scrollToTarget(url, restoreScroll);
      const main = document.querySelector('main');
      if (historyMode !== 'pop' && main) {
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
        main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true });
      }
    } catch {
      window.location.assign(url.href);
    } finally {
      navigating = false;
      setBusy(false);
    }
  }

  function schedulePrefetch(link) {
    window.clearTimeout(prefetchTimer);
    if (!isCanonicalLink(link)) return;
    prefetchTimer = window.setTimeout(() => { fetchPage(link.href).catch(() => {}); }, 80);
  }

  history.replaceState({ ...(history.state || {}), docuDocu: true, scrollX: window.scrollX, scrollY: window.scrollY }, '');
  history.scrollRestoration = 'manual';
  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      history.replaceState({
        ...(history.state || {}),
        docuDocu: true,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }, '');
    });
  }, { passive: true });

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!isCanonicalLink(link, event)) return;
    const target = new URL(link.href, window.location.href);
    if (canonicalURL(target) === canonicalURL(window.location.href)) return;
    event.preventDefault();
    history.replaceState({ ...(history.state || {}), docuDocu: true, scrollX: window.scrollX, scrollY: window.scrollY }, '');
    navigate(target);
  });
  document.addEventListener('pointerover', (event) => schedulePrefetch(event.target.closest('a[href]')));
  document.addEventListener('focusin', (event) => schedulePrefetch(event.target.closest('a[href]')));
  window.addEventListener('popstate', (event) => {
    navigate(window.location.href, {
      historyMode: 'pop',
      restoreScroll: event.state?.docuDocu ? { x: event.state.scrollX, y: event.state.scrollY } : null,
    });
  });
})();
