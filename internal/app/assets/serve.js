(() => {
  'use strict';
  const button = document.querySelector('[data-server-rebuild]');
  const status = document.querySelector('[data-server-rebuild-status]');
  const label = document.querySelector('[data-server-rebuild-label]');
  const baseline = document.querySelector('meta[name="docu-docu-revision"]')?.content || '';
  let etag = baseline ? `"${baseline}"` : '';

  async function pollRevision() {
    try {
      const response = await fetch('/_docu-docu/api/editor/files', {
        cache: 'no-store',
        headers: etag ? { 'If-None-Match': etag } : {},
      });
      if (response.status === 304) return;
      if (!response.ok) return;
      const next = response.headers.get('ETag') || '';
      if (etag && next && next !== etag) {
        window.location.reload();
        return;
      }
      etag = next;
    } catch {
      // The server may be stopping; the current rendered page remains usable.
    }
  }

  button?.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.classList.remove('has-error', 'has-success');
    button.classList.add('is-rebuilding');
    if (label) label.textContent = 'Пересборка…';
    if (status) status.textContent = 'Выполняется: модель, HTML и поисковый индекс.';
    try {
      const response = await fetch('/__docu-docu/rebuild', {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Docu-docu-Action': 'rebuild' },
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail.trim() || `HTTP ${response.status}`);
      }
      const result = await response.json();
      button.classList.remove('is-rebuilding');
      button.classList.add('has-success');
      if (label) label.textContent = 'Готово';
      if (status) status.textContent = `Пересборка завершена: ${result.documents || 0} документов, ${result.pages || 0} страниц. Страница обновляется.`;
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      button.disabled = false;
      button.classList.remove('is-rebuilding');
      button.classList.add('has-error');
      if (label) label.textContent = 'Повторить';
      if (status) status.textContent = `Пересборка не выполнена: ${error.message}. Исправьте причину и повторите.`;
    }
  });

  pollRevision();
  window.setInterval(pollRevision, 2000);
})();
