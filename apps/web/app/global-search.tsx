import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Autocomplete } from '@base-ui/react/autocomplete';
import { Link } from 'react-router';
import type { PortalSnapshotV1 } from '@toudocu/contracts';
import { translator, type Locale } from './i18n.js';
import { Icon } from './ui/index.js';
import { CurrentOutputPath, StaticNavigation, relativePortalHref } from './routing.js';
import type { SearchPage } from './data.js';

export const SearchLoaderContext = createContext<(() => Promise<SearchPage>) | undefined>(
  undefined,
);

type SearchEntry = Extract<
  PortalSnapshotV1['pages'][number],
  { kind: 'search' }
>['entries'][number];

export function GlobalSearch({ snapshot, locale }: { snapshot: PortalSnapshotV1; locale: Locale }) {
  const { text, documentType } = translator(locale);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const from = useContext(CurrentOutputPath);
  const staticNavigation = useContext(StaticNavigation);
  const loadSearch = useContext(SearchLoaderContext);
  const existing = snapshot.pages.find((page) => page.kind === 'search')?.entries;
  const [loaded, setLoaded] = useState<SearchEntry[] | undefined>();
  const [failed, setFailed] = useState(false);
  const entries = existing ?? loaded;
  const index = useMemo(
    () =>
      (entries ?? []).map((entry) => ({
        entry,
        text: `${entry.title}\n${entry.description}\n${entry.text}\n${entry.path}`.toLocaleLowerCase(
          locale,
        ),
      })),
    [entries, locale],
  );
  useEffect(() => {
    if (!open || entries || !loadSearch) return;
    let active = true;
    void loadSearch()
      .then((page) => {
        if (active) {
          setLoaded(page.entries);
          setFailed(false);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, entries, loadSearch]);
  const results = useMemo(() => {
    const value = query.trim().toLocaleLowerCase(locale);
    return (value ? index.filter((item) => item.text.includes(value)) : index)
      .slice(0, 12)
      .map((item) => item.entry);
  }, [index, locale, query]);

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
                  render={
                    staticNavigation ? (
                      <a href={relativePortalHref(from, entry.url)} />
                    ) : (
                      <Link to={`/${entry.url.replace(/^\/+/, '')}`} />
                    )
                  }
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
                {failed
                  ? text('searchLoadFailed')
                  : !entries && loadSearch
                    ? text('loading')
                    : text('noResults')}
              </p>
            )}
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
