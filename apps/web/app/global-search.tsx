import { useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Link } from 'react-router';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { Icon } from './ui/index.js';

type SearchEntry = Extract<PortalSnapshotV1['pages'][number], { kind: 'search' }>['entries'][number];

export function GlobalSearch({
  snapshot,
  locale,
}: {
  snapshot: PortalSnapshotV1;
  locale: Locale;
}) {
  const { text, documentType } = translator(locale);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const entries = useMemo(
    () => snapshot.pages.find((page) => page.kind === 'search')?.entries ?? [],
    [snapshot.pages],
  );
  const results = useMemo(() => {
    const value = query.trim().toLocaleLowerCase(locale);
    return (
      value
        ? entries.filter((entry) =>
            `${entry.title}\n${entry.description}\n${entry.text}\n${entry.path}`
              .toLocaleLowerCase(locale)
              .includes(value),
          )
        : entries
    ).slice(0, 12);
  }, [entries, locale, query]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent): void => {
      const target = event.target;
      const editing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (
        (!editing && event.key === '/') ||
        ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')
      ) {
        event.preventDefault();
        setOpen(true);
        input.current?.focus();
      }
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);

  return (
    <Autocomplete.Root
      items={results}
      value={query}
      onValueChange={setQuery}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      filter={null}
      autoHighlight
      openOnInputClick
      itemToStringValue={(entry: SearchEntry) => entry.title}
    >
      <Autocomplete.InputGroup className="global-search">
        <Autocomplete.Icon className="global-search-icon">
          <Icon name="search" />
        </Autocomplete.Icon>
        <Autocomplete.Input
          ref={input}
          className="global-search-input"
          aria-label={text('search')}
          placeholder={text('searchPlaceholder')}
          onFocus={() => setOpen(true)}
        />
        <kbd className="global-search-shortcut" aria-hidden="true">
          ⌘ K
        </kbd>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner
          className="global-search-positioner"
          sideOffset={6}
          positionMethod="fixed"
        >
          <Autocomplete.Popup className="global-search-popup">
            <Autocomplete.List className="global-search-results">
              {results.map((entry, index) => (
                <Autocomplete.Item
                  key={`${entry.path}:${entry.title}`}
                  value={entry}
                  index={index}
                  className="global-search-result"
                  render={<Link to={`/${entry.url.replace(/^\/+/, '')}`} />}
                  onClick={() => {
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="global-search-result-type">{documentType(entry.type)}</span>
                  <strong>{entry.title}</strong>
                  <code>{entry.path}</code>
                </Autocomplete.Item>
              ))}
            </Autocomplete.List>
            {results.length === 0 && (
              <p className="global-search-empty" role="status">
                {text('noResults')}
              </p>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
