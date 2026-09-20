import { ToudocuError } from '@toudocu/contracts';

export interface GitState {
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  committedInBranch: boolean;
}
export interface GitFileChange {
  status: string;
  path: string;
  oldPath?: string;
}

function tokens(data: Uint8Array): string[] {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).split('\0');
  } catch (cause) {
    throw new ToudocuError('git-invalid-output', 'Git returned a path that is not valid UTF-8', {
      cause,
    });
  }
}

/** NUL is the only record delimiter: whitespace, quotes and newlines belong to filenames. */
export function parseNameStatus(data: Uint8Array): GitFileChange[] {
  const values = tokens(data),
    changes: GitFileChange[] = [];
  let index = 0;
  const statuses: Record<string, string> = {
    A: 'added',
    M: 'modified',
    D: 'deleted',
    R: 'renamed',
    C: 'copied',
    T: 'type-changed',
  };
  while (index < values.length) {
    let status = values[index++]!;
    if (!status) continue;
    const tab = status.indexOf('\t');
    let inline = tab < 0 ? '' : status.slice(tab + 1);
    if (tab >= 0) status = status.slice(0, tab);
    const readPath = () => {
      const path = inline || values[index++];
      inline = '';
      if (!path)
        throw new ToudocuError('git-invalid-output', 'incomplete NUL-separated name-status');
      return path;
    };
    const first = readPath(),
      code = status[0]!;
    const change: GitFileChange = { status: statuses[code] ?? 'modified', path: first };
    if (code === 'R' || code === 'C') {
      change.oldPath = first;
      change.path = readPath();
    }
    changes.push(change);
  }
  return changes;
}

/** Porcelain v2 has fixed metadata fields followed by an unquoted pathname. */
export function parseStatusStates(data: Uint8Array): Map<string, GitState> {
  const values = tokens(data),
    states = new Map<string, GitState>();
  for (let index = 0; index < values.length; index++) {
    const record = values[index]!;
    if (record.startsWith('? ')) {
      states.set(record.slice(2), {
        staged: false,
        unstaged: true,
        untracked: true,
        committedInBranch: false,
      });
      continue;
    }
    const type = record[0];
    if (type !== '1' && type !== '2') continue;
    // split with a limit would discard a filename's remaining spaces in JavaScript.
    const separators = type === '1' ? 8 : 9;
    let offset = 0;
    for (let count = 0; count < separators; count++) {
      const next = record.indexOf(' ', offset);
      if (next < 0) {
        offset = -1;
        break;
      }
      offset = next + 1;
    }
    if (offset >= 0)
      states.set(record.slice(offset), {
        staged: record[2] !== '.',
        unstaged: record[3] !== '.',
        untracked: false,
        committedInBranch: false,
      });
    if (type === '2') index++; // Original pathname is a separate NUL token.
  }
  return states;
}
