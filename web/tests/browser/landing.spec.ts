import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const landing = join(repo, "landing");
const mount = "/docu-docu/";

function mime(path: string): string {
  return ({
    ".css": "text/css",
    ".html": "text/html",
    ".js": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

async function serveLanding(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(mount)) {
      response.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(mount.length)) || "index.html";
    const target = normalize(join(landing, relative));
    if (target !== landing && !target.startsWith(`${landing}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader("Content-Type", mime(target));
      response.end(readFileSync(target));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("landing server did not bind TCP");
  return { server, origin: `http://127.0.0.1:${address.port}${mount}` };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
}

async function expectNoOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function installClipboardProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text: string) => { (window as any).__copiedText = text; } },
    });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  });
}

test("landing loads from the GitHub Pages mount without missing or external assets", async ({ page }) => {
  const hosted = await serveLanding();
  const failed: string[] = [];
  const runtimeOrigins = new Set<string>();
  page.on("response", (response) => {
    const url = new URL(response.url());
    runtimeOrigins.add(url.origin);
    if (response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`);
  });
  try {
    await page.goto(hosted.origin);
    await expect(page).toHaveTitle(/Docu-docu/);
    await expect(page.locator("h1")).toContainText("CODE ON VIBES.");
    await expect(page.locator("h1")).toContainText("DOCUMENT WITH");
    await expect(page.locator("h1")).toContainText("PROOF.");
    await expect(page.locator("#proof, #workflow, #install")).toHaveCount(3);
    await expect(page.locator("img")).toHaveCount(3);
    await expect(page.locator("img:not([alt]), img[alt='']")).toHaveCount(0);
    await expect(page.locator('.header-actions a[href="#install"]')).toHaveText("Install CLI");
    await expect(page.locator('a[href="https://github.com/lumenikoly/docu-docu"]').first()).toContainText("View source");
    await expect.poll(() => failed).toEqual([]);
    expect([...runtimeOrigins]).toEqual([new URL(hosted.origin).origin]);
  } finally {
    await closeServer(hosted.server);
  }
});

test("both install commands copy and the non-Clipboard fallback remains usable", async ({ browser }) => {
  const hosted = await serveLanding();
  const context = await browser.newContext();
  await installClipboardProbe(context);
  const page = await context.newPage();
  try {
    await page.goto(hosted.origin);
    const buttons = page.locator(".copy-button");
    await buttons.nth(0).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain("install.sh | sh");
    await expect(page.locator("#copy-status")).toContainText("LINUX / MACOS command copied");
    await buttons.nth(1).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain("install.ps1 | iex");
    await expect(page.locator("#copy-status")).toContainText("WINDOWS POWERSHELL command copied");

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      (document as any).execCommand = (command: string) => {
        if (command !== "copy") return false;
        (window as any).__fallbackCopy = (document.activeElement as HTMLTextAreaElement)?.value;
        return true;
      };
    });
    await buttons.nth(0).click();
    await expect.poll(() => page.evaluate(() => (window as any).__fallbackCopy)).toContain("install.sh | sh");
  } finally {
    await context.close();
    await closeServer(hosted.server);
  }
});

test("desktop and mobile layouts are keyboard accessible and do not overflow", async ({ browser }) => {
  const hosted = await serveLanding();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(hosted.origin);
      await expectNoOverflow(page);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("#proof .feature-card h2").first()).toBeVisible();
      await expect(page.locator("#workflow h2")).toBeVisible();
      await expect(page.locator("#install h2")).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await expect(page.locator(".skip-link")).toBeVisible();
      await page.keyboard.press("Enter");
      await expect(page.locator("#main")).toBeFocused();
      const reducedState = await page.locator(".hero-stage").first().evaluate((element) => {
        const style = getComputedStyle(element);
        const matrix = new DOMMatrixReadOnly(style.transform);
        return { opacity: style.opacity, translateX: matrix.e, translateY: matrix.f };
      });
      expect(reducedState.opacity).toBe("1");
      expect(reducedState.translateX).toBe(0);
      expect(reducedState.translateY).toBe(0);
      await page.close();
    }
  } finally {
    await closeServer(hosted.server);
  }
});

test("core content remains visible when JavaScript is disabled", async ({ browser }) => {
  const hosted = await serveLanding();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(hosted.origin);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("#proof .feature-card h2").first()).toBeVisible();
    await expect(page.locator("#workflow h2")).toBeVisible();
    await expect(page.locator("#install h2")).toBeVisible();
    await expectNoOverflow(page);
  } finally {
    await context.close();
    await closeServer(hosted.server);
  }
});
