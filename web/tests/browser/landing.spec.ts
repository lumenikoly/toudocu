import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
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
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

async function serveLanding(root = landing): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(mount)) {
      response.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(mount.length)) || "index.html";
    let target = normalize(join(root, relative));
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      if (statSync(target).isDirectory()) target = join(target, "index.html");
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

function runPortalBuild(input: string, output: string): void {
  const result = spawnSync("go", [
    "run", "./cmd/docu-docu", "build", input,
    "--output", output,
    "--repository-root", ".",
    "--clean",
    "--strict",
    "--stale-days", "0",
  ], { cwd: repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Pages artifact build failed\n${result.stdout}\n${result.stderr}`);
}

function buildPagesArtifact(): string {
  const artifact = mkdtempSync(join(tmpdir(), "docu-docu-pages-"));
  try {
    for (const file of ["index.html", "favicon.svg", "styles.css", "script.js"]) {
      cpSync(join(landing, file), join(artifact, file));
    }
    for (const directory of ["ru", "en", "assets"]) {
      cpSync(join(landing, directory), join(artifact, directory), { recursive: true });
    }
    runPortalBuild("./docs", join(artifact, "project-docs"));
    runPortalBuild("./docs-en", join(artifact, "project-docs", "en"));
    return artifact;
  } catch (error) {
    rmSync(artifact, { recursive: true, force: true });
    throw error;
  }
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

test("localized headers identify the beta release", async ({ page }) => {
  const hosted = await serveLanding();
  try {
    for (const locale of ["en", "ru"]) {
      await page.goto(`${hosted.origin}${locale}/`);
      await expect(page.locator(".site-header .wordmark .beta-badge")).toHaveText("BETA");
      await expect(page.locator(".site-footer .beta-badge")).toHaveCount(0);
    }
  } finally {
    await closeServer(hosted.server);
  }
});

test("locale gateway uses only the browser primary locale", async ({ browser }) => {
  const hosted = await serveLanding();
  try {
    for (const [locale, expected] of [
      ["ru", "ru"], ["ru-RU", "ru"], ["ru-UA", "ru"],
      ["en-US", "en"], ["de-DE", "en"], ["uk-UA", "en"], ["zz-ZZ", "en"],
    ] as const) {
      const context = await browser.newContext({ locale });
      const page = await context.newPage();
      await page.goto(hosted.origin);
      await expect(page).toHaveURL(`${hosted.origin}${expected}/`);
      await context.close();
    }

    const context = await browser.newContext({ locale: "en-US" });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "languages", { configurable: true, value: ["en-US", "ru-RU"] });
    });
    const page = await context.newPage();
    await page.goto(hosted.origin);
    await expect(page).toHaveURL(`${hosted.origin}en/`);
    await context.close();
  } finally {
    await closeServer(hosted.server);
  }
});

test("saved choice wins while invalid and unavailable storage fall back safely", async ({ browser }) => {
  const hosted = await serveLanding();
  try {
    const savedContext = await browser.newContext({ locale: "ru-RU" });
    const savedPage = await savedContext.newPage();
    await savedPage.goto(`${hosted.origin}ru/`);
    await savedPage.evaluate(() => localStorage.setItem("docu-docu-landing-locale", "en"));
    await savedPage.goto(hosted.origin);
    await expect(savedPage).toHaveURL(`${hosted.origin}en/`);
    await savedContext.close();

    const corruptContext = await browser.newContext({ locale: "ru-RU" });
    const corruptPage = await corruptContext.newPage();
    await corruptPage.goto(`${hosted.origin}en/`);
    await corruptPage.evaluate(() => localStorage.setItem("docu-docu-landing-locale", "not-a-locale"));
    await corruptPage.goto(hosted.origin);
    await expect(corruptPage).toHaveURL(`${hosted.origin}ru/`);
    await corruptContext.close();

    const blockedContext = await browser.newContext({ locale: "de-DE" });
    await blockedContext.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    });
    const blockedPage = await blockedContext.newPage();
    await blockedPage.goto(hosted.origin);
    await expect(blockedPage).toHaveURL(`${hosted.origin}en/`);
    await blockedContext.close();
  } finally {
    await closeServer(hosted.server);
  }
});

test("direct locale URLs do not redirect and the switch saves an explicit choice", async ({ page }) => {
  const hosted = await serveLanding();
  try {
    await page.goto(`${hosted.origin}en/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.locator("[data-locale-choice='ru']").click();
    await expect(page).toHaveURL(`${hosted.origin}ru/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.goto(hosted.origin);
    await expect(page).toHaveURL(`${hosted.origin}ru/`);
    await page.goto(`${hosted.origin}en/`);
    await expect(page).toHaveURL(`${hosted.origin}en/`);
  } finally {
    await closeServer(hosted.server);
  }
});

test("both locale pages expose localized metadata, content, aria and proof images", async ({ page }) => {
  const hosted = await serveLanding();
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  try {
    for (const locale of ["en", "ru"] as const) {
      await page.goto(`${hosted.origin}${locale}/`);
      await expect(page).toHaveTitle(locale === "en" ? /Code on vibes/ : /Код по вайбу/);
      await expect(page.locator("meta[name='description']")).toHaveAttribute("content", locale === "en" ? /verified model/ : /проверяемую модель/);
      await expect(page.locator("#proof, #workflow, #install, #capabilities, #getting-started")).toHaveCount(5);
      await expect(page.locator("#capabilities .capability-row")).toHaveCount(8);
      await expect(page.locator("#getting-started .start-flow > li")).toHaveCount(5);
      await expect(page.locator("img")).toHaveCount(3);
      await expect(page.locator("img:not([alt]), img[alt='']")).toHaveCount(0);
      await expect(page.locator("img").first()).toHaveAttribute("src", new RegExp(`assets/${locale}/`));
      await expect(page.locator(".locale-switch")).toHaveText(locale === "en" ? "RU" : "EN");
      await expect(page.locator(".header-actions a[href='#install']")).toHaveAttribute("aria-label", locale === "en" ? /Install/ : /Установить/);
    }
    await expect.poll(() => failed).toEqual([]);
  } finally {
    await closeServer(hosted.server);
  }
});

test("Pages artifact serves searchable Russian and English documentation under the repository path", async ({ page }) => {
  const artifact = buildPagesArtifact();
  expect(existsSync(join(artifact, "dev-server.mjs"))).toBe(false);
  const hosted = await serveLanding(artifact);
  const failed: string[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  try {
    await page.goto(`${hosted.origin}ru/`);
    await page.locator('a[href="../project-docs/"]').first().click();
    await expect(page).toHaveURL(`${hosted.origin}project-docs/`);
    await page.locator("[data-global-search]").fill("архитектура");
    await expect(page.locator("[data-search-results]")).not.toBeEmpty();
    await page.goto(`${hosted.origin}project-docs/architecture/overview.html`);
    await expect(page.locator("main article.doc-content").first()).toContainText("Граница системы");

    await page.goto(`${hosted.origin}en/`);
    await page.locator('a[href="../project-docs/en/"]').first().click();
    await expect(page).toHaveURL(`${hosted.origin}project-docs/en/`);
    await page.locator("[data-global-search]").fill("architecture");
    await expect(page.locator("[data-search-results]")).not.toBeEmpty();
    await page.goto(`${hosted.origin}project-docs/en/architecture/overview.html`);
    await expect(page.locator("main article.doc-content").first()).toContainText("System boundary");
    await expect.poll(() => failed).toEqual([]);
  } finally {
    await closeServer(hosted.server);
    rmSync(artifact, { recursive: true, force: true });
  }
});

test("install commands copy with localized status and the fallback remains usable", async ({ browser }) => {
  const hosted = await serveLanding();
  const context = await browser.newContext();
  await installClipboardProbe(context);
  const page = await context.newPage();
  try {
    for (const locale of ["en", "ru"] as const) {
      await page.goto(`${hosted.origin}${locale}/`);
      const buttons = page.locator(".copy-button");
      await buttons.nth(0).click();
      await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain("install.sh | sh");
      await expect(page.locator("#copy-status")).toContainText(locale === "en" ? "command copied" : "команда скопирована");
      await buttons.nth(1).click();
      await expect.poll(() => page.evaluate(() => (window as any).__copiedText)).toContain("install.ps1 | iex");
      await expect(buttons.nth(1)).toHaveText(locale === "en" ? "Copied" : "Скопировано");
    }

    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
      (document as any).execCommand = (command: string) => {
        if (command !== "copy") return false;
        (window as any).__fallbackCopy = (document.activeElement as HTMLTextAreaElement)?.value;
        return true;
      };
    });
    await page.locator(".copy-button").nth(0).click();
    await expect.poll(() => page.evaluate(() => (window as any).__fallbackCopy)).toContain("install.sh | sh");
  } finally {
    await context.close();
    await closeServer(hosted.server);
  }
});

test("responsive locale pages are keyboard accessible, reduced-motion safe and do not overflow", async ({ browser }) => {
  const hosted = await serveLanding();
  try {
    for (const locale of ["en", "ru"] as const) {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
        const page = await browser.newPage({ viewport });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${hosted.origin}${locale}/`);
        await expectNoOverflow(page);
        await expect(page.locator("h1, #proof .feature-card h2, #workflow h2, #install h2, #capabilities h2, #getting-started h2")).toHaveCount(8);
        const flowColumns = await page.locator(".start-flow").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
        expect(flowColumns).toBe(viewport.width <= 700 ? 1 : 5);
        if (viewport.width <= 700) {
          await expect(page.locator(".header-actions a[href='#install'] .mobile-label")).toBeVisible();
          await expect(page.locator(".header-actions a[href='#install'] .mobile-label")).toHaveText("CLI");
          await expect(page.locator(".header-actions a[href='#install'] .desktop-label")).toBeHidden();
          await expect(page.locator(".header-actions a[href*='project-docs']")).toHaveText("Docs");
        }
        await page.keyboard.press("Tab");
        await expect(page.locator(".skip-link")).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.locator("#main")).toBeFocused();
        const reducedState = await page.locator(".hero-stage").first().evaluate((element) => {
          const style = getComputedStyle(element);
          const matrix = new DOMMatrixReadOnly(style.transform);
          return { opacity: style.opacity, translateX: matrix.e, translateY: matrix.f };
        });
        expect(reducedState).toEqual({ opacity: "1", translateX: 0, translateY: 0 });
        await page.close();
      }
    }
  } finally {
    await closeServer(hosted.server);
  }
});

test("without JavaScript the gateway offers both languages and locale content remains available", async ({ browser }) => {
  const hosted = await serveLanding();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await page.goto(hosted.origin);
    await expect(page.locator('a[href="./en/"]')).toHaveText("English");
    await expect(page.locator('a[href="./ru/"]')).toHaveText("Русский");
    for (const locale of ["en", "ru"] as const) {
      await page.goto(`${hosted.origin}${locale}/`);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator("#proof .feature-card h2").first()).toBeVisible();
      await expect(page.locator("#getting-started h2")).toBeVisible();
      await expectNoOverflow(page);
    }
  } finally {
    await context.close();
    await closeServer(hosted.server);
  }
});
