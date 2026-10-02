import { useEffect, useRef, useState } from 'react';
import type { PageViewV1 } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';

export { EditorWorkspace } from './editor-workspace.js';

export function ApiDocsWorkspace({
  page,
  locale,
}: {
  page: Extract<PageViewV1, { kind: 'api-docs' }>;
  locale: Locale;
}) {
  const { text } = translator(locale);
  const requested =
    typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('spec');
  const [selected, setSelected] = useState(
    page.specs.find((spec) => spec.path === requested)?.path ?? page.specs[0]?.path ?? '',
  );
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setError('');
    void fetch(`/_toudocu/api/editor/file?raw=1&path=${encodeURIComponent(selected)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then(setSource)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    const url = new URL(location.href);
    url.searchParams.set('spec', selected);
    history.replaceState(history.state, '', `${url.pathname}${url.search}`);
    return () => controller.abort();
  }, [selected]);
  useEffect(() => {
    if (!host.current || page.specs.length === 0) return;
    let active = true;
    void import('swagger-ui-dist').then(({ SwaggerUIBundle, SwaggerUIStandalonePreset }) => {
      if (!active || !host.current) return;
      host.current.replaceChildren();
      SwaggerUIBundle({
        domNode: host.current,
        urls: page.specs.map((spec) => ({
          name: `${spec.title} · ${spec.version}`,
          url: `/_toudocu/api/editor/file?raw=1&path=${encodeURIComponent(spec.path)}`,
        })),
        ...(page.specs.find((spec) => spec.path === selected)?.title
          ? { 'urls.primaryName': page.specs.find((spec) => spec.path === selected)!.title }
          : {}),
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        validatorUrl: null,
        supportedSubmitMethods: ['get', 'head'],
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
        requestInterceptor: (request: { method?: string }) => {
          const method = (request.method ?? 'GET').toUpperCase();
          if (method !== 'GET' && method !== 'HEAD')
            throw new Error('Only GET and HEAD requests are allowed.');
          return request;
        },
      });
    });
    return () => {
      active = false;
    };
  }, [page.specs, selected]);
  return (
    <div className="workspace api-docs-workspace">
      <header className="workspace-title">
        <div>
          <h1>{text('apiContracts')}</h1>
          <p>{text('apiContractsDescription')}</p>
        </div>
      </header>
      <div className="api-docs-toolbar">
        <label>
          <span>{text('specification')}</span>
          <select value={selected} onChange={(event) => setSelected(event.currentTarget.value)}>
            {page.specs.map((spec) => (
              <option key={spec.path} value={spec.path}>
                {spec.title} · {spec.version}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <a
            href={`/_toudocu/api/editor/file?raw=1&path=${encodeURIComponent(selected)}`}
            target="_blank"
            rel="noreferrer"
          >
            {text('openSource')}
          </a>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {page.specs.length === 0 ? (
        <p className="empty-note">{text('noApiContracts')}</p>
      ) : (
        <div className="swagger-workspace" ref={host} data-source-size={source.length} />
      )}
    </div>
  );
}
