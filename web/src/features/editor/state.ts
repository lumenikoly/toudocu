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
