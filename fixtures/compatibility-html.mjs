// Bundle fingerprints are build details, not CLI compatibility contracts.
// Preserve markup and asset kind while ignoring content-addressed entry names.
export function normalizeHtml(html) {
  return html.replace(
    /((?:src|href)=["'])(?:\.\/|(?:\.\.\/)*|\/)?assets\/[^"']+\.(js|css)(["'])/g,
    '$1assets/<BUNDLE>.$2$3',
  );
}
