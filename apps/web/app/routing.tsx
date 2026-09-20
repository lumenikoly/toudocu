import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';

export const CurrentOutputPath = createContext('index.html');

function splitTarget(value: string): { path: string; suffix: string } {
  const boundary = value.search(/[?#]/u);
  return boundary < 0
    ? { path: value, suffix: '' }
    : { path: value.slice(0, boundary), suffix: value.slice(boundary) };
}

export function relativePortalHref(from: string, to: string): string {
  const target = splitTarget(to);
  const fromParts = splitTarget(from).path.split('/').filter(Boolean);
  const toParts = target.path.split('/').filter(Boolean);
  fromParts.pop();
  while (fromParts.length > 0 && toParts.length > 0 && fromParts[0] === toParts[0]) {
    fromParts.shift();
    toParts.shift();
  }
  return `${[...fromParts.map(() => '..'), ...toParts].join('/') || '.'}${target.suffix}`;
}

export function PortalLink({ to, children }: { to: string; children: ReactNode }) {
  const from = useContext(CurrentOutputPath);
  const location = useLocation();
  const navigate = useNavigate();
  const href = relativePortalHref(from, to);
  const target = splitTarget(to);
  const route = `${target.path.startsWith('/') ? '' : '/'}${target.path}`;
  const current = route === location.pathname;
  const follow = (event: MouseEvent<HTMLAnchorElement>): void => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void navigate(`${route}${target.suffix}`);
  };
  return (
    <a href={href} aria-current={current ? 'page' : undefined} onClick={follow}>
      {children}
    </a>
  );
}
