/** Local source links allow public configuration, while keeping private dotfiles closed. */
export function isAllowedRepositoryPath(path: string): boolean {
  if (!path || /^[a-z]:/iu.test(path) || /[\\%\u0000-\u001f\u007f]/u.test(path)) return false;
  const parts = path.split('/');
  return parts.every((part, index) => {
    if (!part || part === '.' || part === '..') return false;
    if (!part.startsWith('.')) return true;
    if (part === '.github' || part === '.storybook') return true;
    if (part === '.toudocu') return path === '.toudocu/config.yml';
    return (
      index === parts.length - 1 &&
      (part === '.env.example' || /^\.prettierrc(?:\.(?:json|ya?ml|[cm]?js))?$/u.test(part))
    );
  });
}
