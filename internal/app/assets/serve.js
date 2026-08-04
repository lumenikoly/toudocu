(() => {
  'use strict';
  const button = document.querySelector('[data-server-rebuild]');
  const status = document.querySelector('[data-server-rebuild-status]');
  const baseline = document.querySelector('meta[name="docgent-revision"]')?.content || '';
  let etag = baseline ? `"${baseline}"` : '';

  async function pollRevision() {
    try {
      const response = await fetch('/_docgent/api/editor/files', {
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
    button.classList.add('is-rebuilding');
    if (status) status.textContent = 'Пересборка модели и HTML.';
    try {
      const response = await fetch('/__docgent/rebuild', {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'X-Docgent-Action': 'rebuild' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.classList.remove('is-rebuilding');
      button.classList.add('has-error');
      if (status) status.textContent = `Не удалось обновить документацию: ${error.message}.`;
    }
  });

  pollRevision();
  window.setInterval(pollRevision, 2000);
})();
