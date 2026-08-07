import { registerMessages, text } from "./locale";
import { serveRuntimeMessages } from "./messages.ru";
registerMessages(serveRuntimeMessages);
(() => {
    'use strict';
    const page: any = window.DocuDocuPage;
    const rebuildEndpoint: any = page?.runtime === 'serve' && page.capabilities?.rebuild ? page.endpoints?.rebuild : '';
    const editorEndpoint: any = page?.runtime === 'serve' && page.capabilities?.editor ? page.endpoints?.editor : '';
    const button: any = document.querySelector('[data-server-rebuild]');
    const status: any = document.querySelector('[data-server-rebuild-status]');
    const label: any = document.querySelector('[data-server-rebuild-label]');
    const baseline: any = (document.querySelector('meta[name="docu-docu-revision"]') as HTMLMetaElement | null)?.content || '';
    let etag: any = baseline ? `"${baseline}"` : '';
    async function pollRevision() {
        try {
            if (!editorEndpoint)
                return;
            const response: any = await fetch(`${editorEndpoint}/files`, {
                cache: 'no-store',
                headers: etag ? { 'If-None-Match': etag } : {},
            });
            if (response.status === 304)
                return;
            if (!response.ok)
                return;
            const next: any = response.headers.get('ETag') || '';
            if (etag && next && next !== etag) {
                if (document.querySelector('[data-roadmap-dialog][open]'))
                    return;
                window.location.reload();
                return;
            }
            etag = next;
        }
        catch {
            // The server may be stopping; the current rendered page remains usable.
        }
    }
    button?.addEventListener('click', async () => {
        if (button.disabled)
            return;
        button.disabled = true;
        button.classList.remove('has-error', 'has-success');
        button.classList.add('is-rebuilding');
        if (label)
            label.textContent = text("core.serve-runtime.001");
        if (status)
            status.textContent = text("core.serve-runtime.002");
        try {
            if (!rebuildEndpoint)
                throw new Error(text("core.serve-runtime.003"));
            const response: any = await fetch(rebuildEndpoint, {
                method: 'POST',
                cache: 'no-store',
                headers: { Accept: 'application/json', 'X-Docu-docu-Action': 'rebuild' },
            });
            if (!response.ok) {
                const detail: any = await response.text();
                throw new Error(detail.trim() || `HTTP ${response.status}`);
            }
            const result: any = await response.json();
            button.classList.remove('is-rebuilding');
            button.classList.add('has-success');
            if (label)
                label.textContent = text("core.serve-runtime.004");
            if (status)
                status.textContent = text("core.serve-runtime.005", [result.documents || 0, result.pages || 0]);
            window.setTimeout(() => window.location.reload(), 700);
        }
        catch (error: any) {
            button.disabled = false;
            button.classList.remove('is-rebuilding');
            button.classList.add('has-error');
            if (label)
                label.textContent = text("core.serve-runtime.006");
            if (status)
                status.textContent = text("core.serve-runtime.007", [error.message]);
        }
    });
    pollRevision();
    window.setInterval(pollRevision, 2000);
})();
