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
