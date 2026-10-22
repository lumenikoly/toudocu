function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function repositoryDirectoryHtml(path: string, entries: readonly string[]): string {
  const title = escapeHtml(`${path}/`);
  const links = entries.map((entry) => {
    const href = `/_toudocu/repository/${[...path.split('/'), ...entry.split('/')].map(encodeURIComponent).join('/')}`;
    return `<li><a href="${escapeHtml(href)}">${escapeHtml(entry)}</a></li>`;
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1><ul>${links.join('')}</ul></body></html>`;
}
