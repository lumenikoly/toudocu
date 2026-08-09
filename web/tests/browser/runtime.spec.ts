import { expect, test, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function run(command: string, args: string[], cwd = repo): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
}

function mime(path: string): string {
  return ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml" } as Record<string, string>)[extname(path)] ?? "application/octet-stream";
}

async function staticServer(root: string, mount = "/docs/"): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith(mount)) {
      response.writeHead(404).end();
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(mount.length)) || "index.html";
    const target = normalize(join(root, relative));
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
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
  if (!address || typeof address === "string") throw new Error("static server did not bind TCP");
  return { server, origin: `http://127.0.0.1:${address.port}${mount}` };
}

async function waitForHTTP(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function exerciseStaticPortal(page: Page, origin: string): Promise<void> {
  const responses: string[] = [];
  page.on("response", (response) => responses.push(response.url()));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${origin}index.html`);
  await expect(page.locator("main")).toContainText("Docu-docu");
  await expect(page.locator("script#docu-docu-page")).toHaveCount(1);
  await expect(page.locator("[data-server-rebuild], [data-roadmap-add], a[href^='/_docu-docu/editor'], a[href='/changes/']")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.locator("[data-global-search]").fill("Core");
  await expect(page.locator("[data-search-results]")).not.toBeEmpty();
  await page.locator("[data-color-scheme-select]").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
  await page.goto(`${origin}use-cases/UC-CORE-01.html`);
  await expect(page.locator("main article.doc-content").first()).toContainText("Пользователь");
  await expect.poll(() => page.locator("script#docu-docu-page").textContent()).toContain("UC-CORE-01");
  const tabs = page.locator("[data-usecase-tab]");
  await expect(tabs).toHaveCount(4);
  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.nth(1).press("ArrowRight");
  await expect(tabs.nth(2)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(2)).toBeFocused();
  await page.goto(`${origin}flows/FLOW-CORE-REQUEST.html`);
  await expect(page.locator("[data-mermaid-diagram] svg").first()).toBeVisible();
  await expect.poll(() => responses.some((url) => url.endsWith("/assets/portal.css"))).toBe(true);
  await expect.poll(() => responses.some((url) => url.endsWith("/assets/portal.js"))).toBe(true);
  await page.goto(`${origin}notes.html`);
  await expect(page.locator("[data-mermaid-error]")).toBeVisible();
  await page.goto(`${origin}risks.html`);
  await expect(page.locator(".risk-status")).toContainText("Незакрытых рисков: 1 из 1");
  await expect(page.locator(".risk-status-explanations")).toContainText("Открыт — требует решения.");
}

test("static portal works over HTTP at root and nested paths", async ({ browser }) => {
  const fixture = mkdtempSync(join(tmpdir(), "docu-docu-static-"));
  cpSync(join(repo, "example", "docs"), join(fixture, "docs"), { recursive: true });
  const output = join(fixture, "site");
  run("go", ["run", "./cmd/docu-docu", "build", join(fixture, "docs"), "--repository-root", fixture, "-o", output, "--clean"]);
  const notesPage = join(output, "notes.html");
  writeFileSync(notesPage, readFileSync(notesPage, "utf8").replace("</article>", '<figure data-mermaid-container><pre class="mermaid" data-mermaid-diagram>graph TD\nbroken[</pre><p data-mermaid-error hidden>Не удалось отобразить диаграмму.</p></figure></article>'));
  for (const mount of ["/", "/docs/"]) {
    const hosted = await staticServer(output, mount);
    const page = await browser.newPage();
    try {
      await exerciseStaticPortal(page, hosted.origin);
    } finally {
      await page.close();
      await new Promise<void>((resolveClose) => hosted.server.close(() => resolveClose()));
    }
  }
});

test("serve exposes rebuild, editor CAS, and changes workspace", async ({ page }) => {
  const fixture = mkdtempSync(join(tmpdir(), "docu-docu-serve-"));
  cpSync(join(repo, "example", "docs"), join(fixture, "docs"), { recursive: true });
  cpSync(join(repo, "example", ".docu-docu"), join(fixture, ".docu-docu"), { recursive: true });
  run("git", ["init", "-q"], fixture);
  run("git", ["config", "user.email", "browser@example.invalid"], fixture);
  run("git", ["config", "user.name", "Browser Test"], fixture);
  run("git", ["add", "."], fixture);
  run("git", ["commit", "-qm", "fixture"], fixture);
  const portServer = createServer();
  await new Promise<void>((resolveListen) => portServer.listen(0, "127.0.0.1", resolveListen));
  const address = portServer.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve port");
  const port = address.port;
  await new Promise<void>((resolveClose) => portServer.close(() => resolveClose()));
  const child: ChildProcess = spawn("go", ["run", "./cmd/docu-docu", "serve", join(fixture, "docs"), "--repository-root", fixture, "-o", join(fixture, "site"), "--host", "127.0.0.1", "--port", String(port)], { cwd: repo, stdio: "pipe" });
  const origin = `http://127.0.0.1:${port}`;
  let latestVersion = "0.0.2";
  try {
    await waitForHTTP(origin);
    await page.route("**/_docu-docu/api/version", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        schemaVersion: 1,
        currentVersion: "0.0.1",
        status: "update-available",
        latestVersion,
        releaseURL: `https://github.com/lumenikoly/docu-docu/releases/tag/${latestVersion}`,
      }),
    }));
    await page.route("**/assets/*.js", async (route) => {
      if (!route.request().url().endsWith("/appearance.js")) await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      await route.continue();
    });
    await page.addInitScript(() => {
      localStorage.setItem("docu-docu-site-theme", "paper");
      localStorage.setItem("docu-docu-color-scheme", "dark");
      localStorage.setItem("docu-docu-accent", "violet");
      requestAnimationFrame(() => {
        (window as any).__docuDocuFirstFrame = {
          siteTheme: document.documentElement.dataset.siteTheme,
          colorScheme: document.documentElement.dataset.colorScheme,
          theme: document.documentElement.dataset.theme,
          accent: document.documentElement.dataset.accent,
        };
      });
    });
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => (window as any).__docuDocuFirstFrame)).toEqual({ siteTheme: "paper", colorScheme: "dark", theme: "dark", accent: "violet" });
    await expect(page.locator("[data-server-rebuild]")).toBeVisible();
    const updateNotice = page.locator("[data-update-notice]");
    await expect(updateNotice).toContainText("Доступна Docu-docu 0.0.2");
    await expect(updateNotice).toContainText("У вас 0.0.1");
    await expect(updateNotice.locator("a")).toHaveAttribute("href", "https://github.com/lumenikoly/docu-docu/releases/tag/0.0.2");
    await expect(updateNotice.locator("a")).toHaveAttribute("rel", "noopener noreferrer");
    const portalFonts: Record<string, Record<string, string>> = {};
    for (const siteTheme of ["classic", "paper", "terminal"]) {
      await page.locator("[data-site-theme-select]").selectOption(siteTheme);
      portalFonts[siteTheme] = await page.evaluate(() => {
        const codeProbe = document.createElement("span");
        codeProbe.style.fontFamily = "var(--font-mono)";
        document.body.append(codeProbe);
        const mono = getComputedStyle(codeProbe).fontFamily;
        codeProbe.remove();
        return {
          body: getComputedStyle(document.body).fontFamily,
          interface: getComputedStyle(document.querySelector(".site-header")!).fontFamily,
          heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
          mono,
        };
      });
    }
    await page.locator('main a.recommended-entry[href="architecture/overview.html"]').click();
    await page.waitForURL("**/architecture/overview.html");
    await expect(updateNotice).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.DocuDocuPage?.page.path)).toBe("architecture/overview.html");
    await expect.poll(() => page.evaluate(() => window.DocuDocuPage?.portal.dataBase)).toBe("../data/");
    await page.locator("[data-global-search]").fill("Core");
    await expect(page.locator("[data-search-results]")).not.toBeEmpty();
    await page.goto(origin);
    await updateNotice.getByRole("button", { name: "Скрыть уведомление о версии 0.0.2" }).click();
    await expect(updateNotice).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[data-update-notice]")).toHaveCount(0);
    latestVersion = "0.0.3";
    await page.reload();
    await expect(page.locator("[data-update-notice]")).toContainText("Доступна Docu-docu 0.0.3");
    await page.locator("[data-server-rebuild]").click();
    await expect(page.locator("[data-server-rebuild]")).not.toHaveClass(/is-rebuilding/);

    const roadmapPath = join(fixture, "docs", "roadmap.md");
    await page.goto(`${origin}/roadmap.html`);
    const roadmapTrigger = page.locator("[data-roadmap-add]");
    await roadmapTrigger.focus();
    await roadmapTrigger.press("Enter");
    await expect(page.locator("[data-roadmap-dialog]")).toBeVisible();
    await page.locator("[data-roadmap-dialog]").press("Escape");
    await expect(page.locator("[data-roadmap-dialog]")).not.toBeVisible();
    await expect(roadmapTrigger).toBeFocused();
    await roadmapTrigger.click();
    const roadmapDialog = page.locator("[data-roadmap-dialog]");
    await expect(roadmapDialog.locator('input[name="id"]')).toHaveValue("DLV-ROADMAP-001");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-update-notice]")).toBeInViewport();
    await expect(page.locator("[data-update-notice] a")).toBeVisible();
    await expect(page.locator("[data-update-notice] button")).toBeVisible();
    await expect(roadmapDialog).toBeInViewport();
    await expect(roadmapDialog.locator('input[name="text"]')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    await roadmapDialog.locator('select[name="stageAnchor"]').selectOption("mvp");
    await roadmapDialog.locator('input[name="id"]').fill("DLV-BROWSER-001");
    await roadmapDialog.locator('input[name="text"]').fill("Browser value survives conflict.");
    writeFileSync(roadmapPath, `${readFileSync(roadmapPath, "utf8")}\n## Browser stage\n\n- Status: Planned\n\n- [ ] \`DLV-ROADMAP-007\` External result.\n`);
    await roadmapDialog.locator('button[type="submit"]').click();
    await expect(roadmapDialog.locator("[data-state='conflict']")).toContainText("введённые данные сохранены");
    await expect(roadmapDialog.locator('input[name="id"]')).toHaveValue("DLV-BROWSER-001");
    await expect(roadmapDialog.locator('input[name="text"]')).toHaveValue("Browser value survives conflict.");
    await expect(roadmapDialog.locator('select[name="stageAnchor"] option[value="browser-stage"]')).toHaveCount(1);
    await expect(roadmapDialog.locator(".roadmap-id-hint")).toContainText("DLV-ROADMAP-008");
    await roadmapDialog.locator('select[name="stageAnchor"]').selectOption("browser-stage");
    await roadmapDialog.locator('input[name="text"]').fill("Browser-added deliverable.");
    await roadmapDialog.locator('button[type="submit"]').click();
    await expect(roadmapDialog.locator("[data-state='success']")).toContainText("DLV-BROWSER-001");
    await page.waitForURL("**/roadmap.html#browser-stage");
    await expect(page.locator("#browser-stage").locator("xpath=..")).toContainText("DLV-BROWSER-001");
    await expect(page.locator(".progress-label")).toContainText("из 6");

    await page.goto(`${origin}/_docu-docu/editor/`);
    await expect.poll(() => page.evaluate(() => (window as any).__docuDocuFirstFrame)).toEqual({ siteTheme: "paper", colorScheme: "dark", theme: "dark", accent: "violet" });
    await page.locator("[data-create-open]").click();
    await expect(page.locator("[data-create-dialog]")).toBeVisible();
    await page.locator("[data-create-dialog]").press("Escape");
    await expect(page.locator("[data-create-dialog]")).not.toBeVisible();
    await page.locator('[data-file-path="notes.md"]').click();
    await expect(page.locator("[data-current-path]")).toHaveText("notes.md");
    for (const siteTheme of ["classic", "paper", "terminal"]) {
      await page.locator("[data-site-theme-select]").selectOption(siteTheme);
      const workspaceFonts = await page.evaluate(() => ({
        body: getComputedStyle(document.querySelector(".preview-pane")!).fontFamily,
        interface: getComputedStyle(document.querySelector(".workspace-header")!).fontFamily,
        heading: getComputedStyle(document.querySelector("dialog h2")!).fontFamily,
        mono: getComputedStyle(document.querySelector(".cm-scroller")!).fontFamily,
      }));
      expect(workspaceFonts.body).toBe(portalFonts[siteTheme].body);
      expect(workspaceFonts.interface).toBe(portalFonts[siteTheme].interface);
      expect(workspaceFonts.mono).toBe(portalFonts[siteTheme].mono);
      expect(workspaceFonts.heading).toBe(portalFonts[siteTheme].heading);
    }
    const filePath = join(fixture, "docs", "notes.md");
    const editor = page.locator(".cm-content");
    await editor.click();
    await editor.press("Control+End");
    await editor.pressSequentially("\nBrowser save.");
    await page.locator("[data-site-theme-select]").selectOption("terminal");
    await expect(page.locator("[data-dirty-state]")).toBeVisible();
    await expect(editor).toContainText("Browser save.");
    await editor.click();
    await editor.press("Control+z");
    await expect(editor).not.toContainText("Browser save.");
    await editor.press("Control+Shift+z");
    await expect(editor).toContainText("Browser save.");
    await page.locator("[data-save]").click();
    await expect(page.locator("[data-dirty-state]")).toBeHidden();
    writeFileSync(filePath, `${readFileSync(filePath, "utf8")}\nExternal edit.\n`);
    await editor.click();
    await editor.press("Control+End");
    await editor.pressSequentially("\nBrowser conflict.");
    await page.locator("[data-save]").click();
    await expect(page.locator("[data-conflict]")).toBeVisible();

    await page.route("**/_docu-docu/api/changes?**", async (route) => {
      const response = await route.fetch();
      if (response.status() === 304) {
        await route.fulfill({ response });
        return;
      }
      const report = await response.json();
      for (const change of report.changes ?? []) {
        if (change.path.endsWith("notes.md")) {
          change.semanticDiffAvailable = false;
          change.semanticChanges = [];
          change.diagnostics = [...(change.diagnostics ?? []), { severity: "warning", code: "semantic-unavailable", message: "semantic unavailable" }];
        }
      }
      await route.fulfill({ response, json: report });
    });
    await page.route("**/_docu-docu/api/changes/review/repository/changes?**", async (route) => {
      const response = await route.fetch();
      if (response.status() === 304) {
        await route.fulfill({ response });
        return;
      }
      const report = await response.json();
      for (const file of report.files ?? []) {
        if (file.path.endsWith("notes.md") && file.documentation) {
          file.documentation.semanticDiffAvailable = false;
          file.documentation.semanticChanges = [];
          file.documentation.diagnostics = [...(file.documentation.diagnostics ?? []), { severity: "warning", code: "semantic-unavailable", message: "semantic unavailable" }];
        }
      }
      await route.fulfill({ response, json: report });
    });
    await page.route("**/_docu-docu/api/changes/render?**", (route) => route.fulfill({ status: 503, body: "render unavailable" }));
    await page.goto(`${origin}/changes/`);
    await expect.poll(() => page.evaluate(() => (window as any).__docuDocuFirstFrame)).toEqual({ siteTheme: "paper", colorScheme: "dark", theme: "dark", accent: "violet" });
    await expect(page.locator("[data-file-list]")).toBeVisible();
    await expect(page.locator("body")).toContainText("notes.md");
    await page.locator('[data-file-list] [data-path$="notes.md"]').click();
    await expect(page.locator('[data-tab="semantic"]')).toHaveCount(0);
    await page.locator('[data-tab="rendered"]').click();
    await expect(page.locator("[data-tab-panel]")).toContainText("Rendered diff недоступен");
    await page.locator('[data-tab="source"]').click();
    await expect(page.locator("[data-source-view]")).toContainText("External edit");
    await page.locator("[data-site-theme-select]").selectOption("terminal");
    await expect(page.locator('[data-tab="source"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("[data-source-view]")).toContainText("External edit");

    const fallbackContext = await page.context().browser()!.newContext();
    const fallbackPage = await fallbackContext.newPage();
    try {
      await fallbackPage.emulateMedia({ colorScheme: "dark" });
      await fallbackPage.addInitScript(() => {
        localStorage.setItem("docu-docu-site-theme", "invalid-theme");
        localStorage.setItem("docu-docu-color-scheme", "system");
      });
      await fallbackPage.goto(origin);
      await expect(fallbackPage.locator("html")).toHaveAttribute("data-site-theme", "classic");
      await expect(fallbackPage.locator("html")).toHaveAttribute("data-color-scheme", "system");
      await expect(fallbackPage.locator("html")).toHaveAttribute("data-theme", "dark");
    } finally {
      await fallbackContext.close();
    }

    const privateContext = await page.context().browser()!.newContext();
    const privatePage = await privateContext.newPage();
    try {
      await privatePage.emulateMedia({ colorScheme: "dark" });
      await privatePage.addInitScript(() => {
        Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("storage unavailable"); } });
      });
      await privatePage.goto(`${origin}/_docu-docu/editor/`);
      await expect(privatePage.locator("html")).toHaveAttribute("data-site-theme", "classic");
      await expect(privatePage.locator("html")).toHaveAttribute("data-color-scheme", "system");
      await expect(privatePage.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(privatePage.locator("[data-file-tree]")).toBeVisible();
    } finally {
      await privateContext.close();
    }

    await page.route("**/_docu-docu/editor/?disabled=1", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('"editor":true', '"editor":false');
      await route.fulfill({ response, body });
    });
    await page.goto(`${origin}/_docu-docu/editor/?disabled=1`);
    await expect(page.locator('[data-ui-state="capability-unavailable"]')).toContainText("Редактор недоступен");
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  }
});

test("Changes review hands three outcomes to the local agent CLI without auto-resolve", async ({ page }) => {
  const fixture = mkdtempSync(join(tmpdir(), "docu-docu-review-browser-"));
  const stateRoot = mkdtempSync(join(tmpdir(), "docu-docu-review-state-"));
  cpSync(join(repo, "example", "docs"), join(fixture, "docs"), { recursive: true });
  cpSync(join(repo, "example", ".docu-docu"), join(fixture, ".docu-docu"), { recursive: true });
  writeFileSync(join(fixture, "server.go"), "package review\n\nfunc Server() string { return \"old\" }\n");
  writeFileSync(join(fixture, "path.go"), "package review\n\nfunc Path() string { return \"old\" }\n");
  writeFileSync(join(fixture, "legacy.go"), "package review\n\nfunc Legacy() bool { return true }\n");
  run("git", ["init", "-q"], fixture);
  run("git", ["config", "user.email", "review@example.invalid"], fixture);
  run("git", ["config", "user.name", "Review Browser"], fixture);
  run("git", ["add", "."], fixture);
  run("git", ["commit", "-qm", "baseline"], fixture);
  writeFileSync(join(fixture, "server.go"), "package review\n\nfunc Server() string { return \"current\" }\n");
  writeFileSync(join(fixture, "path.go"), "package review\n\nfunc Path() string { return \"candidate\" }\n");
  run("git", ["rm", "-q", "legacy.go"], fixture);

  const portServer = createServer();
  await new Promise<void>((resolveListen) => portServer.listen(0, "127.0.0.1", resolveListen));
  const address = portServer.address();
  if (!address || typeof address === "string") throw new Error("failed to reserve review port");
  const port = address.port;
  await new Promise<void>((resolveClose) => portServer.close(() => resolveClose()));
  const environment = { ...process.env, DOCU_DOCU_STATE_HOME: stateRoot };
  const child = spawn("go", ["run", "./cmd/docu-docu", "serve", join(fixture, "docs"), "--repository-root", fixture, "-o", join(fixture, "site"), "--host", "127.0.0.1", "--port", String(port), "--no-update-check"], { cwd: repo, env: environment, stdio: "pipe" });
  const origin = `http://127.0.0.1:${port}`;
  const feedbackCLI = (args: string[]) => {
    const result = spawnSync("go", ["run", "./cmd/docu-docu", "changes", "feedback", ...args, "--repository-root", fixture, "--json"], { cwd: repo, env: environment, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`feedback CLI failed\n${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
  };
  try {
    await waitForHTTP(origin);
    await page.goto(`${origin}/changes/`);
    await expect(page.getByRole("heading", { name: "Изменения", exact: true })).toBeVisible();
    await expect(page.locator('[data-file-list] [data-path="server.go"]')).toBeVisible();

    for (const path of ["server.go", "path.go"]) {
      await page.locator(`[data-file-list] [data-path="${path}"]`).click();
      await expect(page.locator('.changes-detail-header p')).toContainText(path);
      await page.locator('[data-tab="source"]').click();
      await page.locator('[data-detail] [data-file-comment]').click();
      const composer = page.locator('[data-review-composer]');
      await expect(composer).toBeVisible();
      await composer.locator('[data-review-type]').selectOption(path === "server.go" ? "issue" : "suggestion");
      await composer.locator('[data-review-message]').fill(path === "server.go" ? "Проверь контракт Server." : "Уточни выбор path.");
      await composer.locator('button[type="submit"]').click();
      await expect(composer).not.toBeVisible();
    }

    await page.locator('[data-file-list] [data-path="legacy.go"]').click();
    await expect(page.locator('.changes-detail-header p')).toContainText("legacy.go");
    await page.locator('[data-tab="source"]').click();
    await page.locator('[data-review-side="old"] .diff-comment').first().click();
    const composer = page.locator('[data-review-composer]');
    await composer.locator('[data-review-type]').selectOption("question");
    await composer.locator('[data-review-message]').fill("Legacy точно можно удалить?");
    await composer.locator('button[type="submit"]').click();

    await expect(page.locator('[data-open-discussion-count]')).toHaveText("3");
    await expect(page.locator('[data-unsent-count]')).toHaveText("3");
    await page.locator('[data-send-feedback]').click();
    await expect(page.locator('[data-unsent-count]')).toHaveText("0");

    const pending = feedbackCLI(["pending"]);
    expect(pending.feedback.items).toHaveLength(3);
    writeFileSync(join(fixture, "path.go"), "package review\n\nfunc Path() string { return \"fixed\" }\n");
    writeFileSync(join(fixture, "server_test.go"), "package review\n\nimport \"testing\"\n\nfunc TestPath(t *testing.T) { if Path() == \"\" { t.Fatal(\"empty\") } }\n");
    const results = pending.feedback.items.map((item: any) => {
      if (item.target.path === "path.go") return { itemId: item.id, outcome: "fixed", message: "Path исправлен и покрыт тестом.", changedPaths: ["path.go", "server_test.go"] };
      if (item.target.path === "legacy.go") return { itemId: item.id, outcome: "notFixed", message: "Удаление оставлено как в working tree.", changedPaths: ["legacy.go"] };
      return { itemId: item.id, outcome: "needsClarification", message: "Нужно уточнить ожидаемый контракт Server.", changedPaths: [] };
    });
    const responsePath = join(mkdtempSync(join(tmpdir(), "docu-docu-review-response-")), "response.json");
    writeFileSync(responsePath, JSON.stringify({
      schemaVersion: 1,
      reviewId: pending.feedback.reviewId,
      feedbackId: pending.feedback.id,
      feedbackDigest: pending.feedback.feedbackDigest,
      expectedRevision: pending.revision,
      expectedStateDigest: pending.stateDigest,
      results,
    }));
    feedbackCLI(["respond", "--input", responsePath]);

    await expect(page.locator('[data-discussion-list]')).toContainText("Исправлено");
    await expect(page.locator('[data-discussion-list]')).toContainText("Не исправлено");
    await expect(page.locator('[data-discussion-list]')).toContainText("Нужно уточнение");
    await expect(page.locator('[data-open-discussion-count]')).toHaveText("3");

    const legacyThread = page.locator('.review-thread').filter({ hasText: "legacy.go" });
    await legacyThread.getByRole("button", { name: "Посмотреть исправление" }).click();
    await expect(page.locator('.diff-line.review-placement-highlight')).toBeVisible();

    const pathThread = page.locator('.review-thread').filter({ hasText: "path.go" });
    await pathThread.getByRole("button", { name: "Ответить" }).click();
    await composer.locator('[data-review-message]').fill("Повторно проверь только этот path.");
    await composer.locator('button[type="submit"]').click();
    await expect(page.locator('[data-unsent-count]')).toHaveText("1");
    await page.locator('[data-send-feedback]').click();
    const repeated = feedbackCLI(["pending"]);
    expect(repeated.feedback.items).toHaveLength(1);
    expect(repeated.feedback.items[0].target.path).toBe("path.go");

    await page.locator('[data-discussions-close]').click();
    await page.setViewportSize({ width: 390, height: 844 });
    const filesToggle = page.locator('[data-mobile-files]');
    await filesToggle.click();
    await expect(page.locator('[data-files-panel]')).toHaveAttribute("role", "dialog");
    await expect(page.locator('[data-files-panel]')).toHaveAttribute("aria-modal", "true");
    await page.keyboard.press("Escape");
    await expect(filesToggle).toBeFocused();
    const discussionsToggle = page.locator('[data-discussions-toggle]');
    await discussionsToggle.click();
    await expect(page.locator('[data-discussions-panel]')).toHaveAttribute("role", "dialog");
    await page.keyboard.press("Escape");
    await expect(discussionsToggle).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expect(page.locator('[data-discussions-panel]')).toHaveAttribute("hidden", "");
    expect(await page.evaluate(() => window.DocuDocuPage?.capabilities.review)).toBe(true);
    expect((await page.locator('script#docu-docu-page').textContent())?.includes("reviewId")).toBe(false);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  }
});
