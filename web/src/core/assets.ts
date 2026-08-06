import type { PageBootstrap } from "./bootstrap";

export function resolveAsset(page: PageBootstrap, name: string): URL {
  return new URL(name, new URL(page.portal.assetBase, window.location.href));
}

export function resolveData(page: PageBootstrap, name: string): URL {
  return new URL(name, new URL(page.portal.dataBase, window.location.href));
}
