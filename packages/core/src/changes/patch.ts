const hunkHeader = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

/** Keep exact Git hunk headers and bodies, including missing final newlines. */
export function parseSourceDiffHunks(patch: string) {
  const lines = patch.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const hunks = [];
  for (let index = 0; index < lines.length;) {
    const header = lines[index]!.replace(/\n$/u, '');
    const match = hunkHeader.exec(header);
    if (!match) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < lines.length && !hunkHeader.test(lines[end]!.replace(/\n$/u, ''))) {
      end += 1;
    }

    const oldStart = Number(match[1]);
    const newStart = Number(match[3]);

    hunks.push({
      id: `hunk-${oldStart}-${newStart}`,
      header,
      oldStart,
      oldLines: match[2] === undefined ? 1 : Number(match[2]),
      newStart,
      newLines: match[4] === undefined ? 1 : Number(match[4]),
      patch: lines.slice(index, end).join(''),
    });
    index = end;
  }
  return hunks;
}

export function countPatchLines(patch: string) {
  const result = {
    added: 0,
    deleted: 0,
  };
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      result.added += 1;
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      result.deleted += 1;
    }
  }
  return result;
}

export function classifyChangePath(documentRoot: string, path: string): string {
  const prefix = documentRoot.replace(/\/$/u, '') + '/';
  const relativePath = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  const lower = relativePath.toLowerCase();

  if (lower.startsWith('work/') || lower.includes('/notes/') || lower.endsWith('notes.md')) {
    return 'work-artifact';
  }

  if (lower.startsWith('contracts/') || /\.(?:yaml|yml|json)$/u.test(lower)) {
    return 'contract';
  }

  if (/\.(?:png|jpg|jpeg|webp|svg)$/u.test(lower)) {
    return 'asset';
  }

  return 'permanent-documentation';
}
