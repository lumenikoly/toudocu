export function diagnosticsForEditor(diagnostics: any[], currentPath: string): any[] {
    return diagnostics.filter((diagnostic: any) => diagnostic.path === currentPath);
}

export function editorResponseIsCurrent(
    requestPath: string,
    currentPath: string,
    requestGeneration: number,
    currentGeneration: number,
): boolean {
    return requestPath === currentPath && requestGeneration === currentGeneration;
}

export type EditorFileTreeEntry =
    | { kind: "file"; name: string; file: any }
    | { kind: "directory"; name: string; path: string; children: EditorFileTreeEntry[] };

export function buildFileTree(files: any[]): EditorFileTreeEntry[] {
    const root: EditorFileTreeEntry[] = [];
    const directories = new Map<string, Extract<EditorFileTreeEntry, { kind: "directory" }>>();
    for (const file of files) {
        const parts = file.path.split('/');
        const name = parts.pop();
        let path = '';
        let entries = root;
        for (const part of parts) {
            path = path ? `${path}/${part}` : part;
            let directory = directories.get(path);
            if (!directory) {
                directory = { kind: "directory", name: part, path, children: [] };
                directories.set(path, directory);
                entries.push(directory);
            }
            entries = directory.children;
        }
        entries.push({ kind: "file", name, file });
    }
    return root;
}

const utf8Encoder = new TextEncoder();

export function utf16OffsetForUTF8Column(line: string, column: number): number {
    const byteLimit = Math.max(0, (Number(column) || 1) - 1);
    let bytes = 0;
    let offset = 0;
    for (const character of line) {
        const next = bytes + utf8Encoder.encode(character).length;
        if (next > byteLimit)
            break;
        bytes = next;
        offset += character.length;
    }
    return offset;
}
