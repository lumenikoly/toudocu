/** Normalize one semantic-table cell using the legacy Go tableCell rules. */
export function normalizeTableCell(cells: readonly string[], index: number | undefined): string {
  if (index === undefined) {
    return '';
  }
  let value = trimGoSpace(cells[index] ?? '');
  value = trimBackticks(value);
  value = trimGoSpace(value);
  if (value.startsWith('**') && value.endsWith('**')) {
    value = trimGoSpace(value.slice(2, -2));
  }
  if (value === '—' || value === '-') {
    return '';
  }
  return value;
}

function trimGoSpace(value: string): string {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
}

function trimBackticks(value: string): string {
  return value.replace(/^`+|`+$/gu, '');
}
