import type { PageBootstrap } from "./bootstrap";

export function hasCapability(page: PageBootstrap | undefined, name: keyof PageBootstrap["capabilities"]): boolean {
  return page?.capabilities[name] === true;
}

export function endpoint(page: PageBootstrap | undefined, name: "editor" | "changes" | "rebuild"): string | null {
  if (!page || page.runtime !== "serve") return null;
  const value = page.endpoints?.[name];
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : null;
}
