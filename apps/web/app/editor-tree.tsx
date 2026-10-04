import type { EditorFileList } from '@toudocu/contracts';

type Entry =
  | { kind: 'file'; file: EditorFileList['files'][number] }
  | { kind: 'directory'; name: string; path: string; children: Entry[] };

export function buildEditorTree(files: EditorFileList['files']): Entry[] {
  const root: Entry[] = [];
  const directories = new Map<string, Extract<Entry, { kind: 'directory' }>>();
  for (const file of files) {
    const parts = file.path.split('/');
    parts.pop();
    let path = '';
    let entries = root;
    for (const name of parts) {
      path = path ? `${path}/${name}` : name;
      let directory = directories.get(path);
      if (!directory) {
        directory = { kind: 'directory', name, path, children: [] };
        directories.set(path, directory);
        entries.push(directory);
      }
      entries = directory.children;
    }
    entries.push({ kind: 'file', file });
  }
  return root;
}

export function EditorTree({
  entries,
  active,
  collapsed,
  filtering,
  onToggle,
  onOpen,
}: {
  entries: Entry[];
  active: string;
  collapsed: ReadonlySet<string>;
  filtering: boolean;
  onToggle: (path: string, open: boolean) => void;
  onOpen: (path: string) => void;
}) {
  return (
    <ul>
      {entries.map((entry) =>
        entry.kind === 'file' ? (
          <li key={entry.file.path}>
            <button
              type="button"
              aria-current={entry.file.path === active ? 'true' : undefined}
              title={entry.file.path}
              onClick={() => onOpen(entry.file.path)}
            >
              <span>{entry.file.title ?? entry.file.path.split('/').at(-1)}</span>
              <code>{entry.file.path.split('/').at(-1)}</code>
            </button>
          </li>
        ) : (
          <li key={entry.path}>
            <details
              className="editor-file-group"
              open={filtering || !collapsed.has(entry.path)}
              onToggle={(event) => {
                if (!filtering && event.currentTarget.open === collapsed.has(entry.path))
                  onToggle(entry.path, event.currentTarget.open);
              }}
            >
              <summary>{entry.name}</summary>
              <EditorTree
                entries={entry.children}
                active={active}
                collapsed={collapsed}
                filtering={filtering}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            </details>
          </li>
        ),
      )}
    </ul>
  );
}
