import { expect, test, type Page } from '@playwright/test';

async function captureLightAndDark(page: Page, name: string): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.evaluate((value) => {
      document.documentElement.dataset.colorScheme = value;
    }, scheme);
    await expect(page.locator('html')).toHaveCSS('color-scheme', scheme);
    await page.screenshot({ path: `/tmp/toudocu-ui-${name}-${scheme}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    document.documentElement.dataset.colorScheme = 'light';
  });
}

test('task metadata and supporting sections stay structured', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./work/TASK-COMPAT-001.html');

  const properties = page.locator('.document-properties');
  await expect(properties).not.toHaveAttribute('open');
  await properties.locator('summary').click();
  await expect(properties).toHaveAttribute('open', '');
  const metadata = page.locator('.document-metadata');
  await expect(metadata).toBeVisible();
  await expect(metadata).toHaveJSProperty('tagName', 'DL');
  await expect(metadata.locator('dt')).toContainText([
    'Updated',
    'module',
    'priority',
    'taskType',
    'useCase',
    'Path',
  ]);
  await expect(page.locator('.document-identity .status')).toHaveAttribute('data-tone', 'success');
  await expect(page.locator('.document-identity .status svg')).toHaveCount(1);
});

test('search stays inline, supports keyboard navigation, and works from nested routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('#main-content')).toBeVisible();
  await captureLightAndDark(page, 'desktop-home');

  await page.goto('./modules/core.html');
  await expect(page.getByRole('heading', { name: 'Core module' })).toBeVisible();
  await expect(page.locator('.document-toc')).toHaveAttribute('open', '');
  await captureLightAndDark(page, 'desktop-document');

  const search = page.getByRole('combobox', { name: 'Search' });
  const popup = page.locator('.global-search-popup');
  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await search.fill('Compare CLI contracts');
  await expect(page.getByRole('option', { name: /Compare CLI contracts/u })).toBeVisible();
  await expect(popup).toBeVisible();
  await expect(page.locator('dialog, [aria-modal="true"]')).toHaveCount(0);
  const anchorBounds = await page.locator('.global-search').boundingBox();
  const popupBounds = await page.locator('.global-search-positioner').boundingBox();
  expect(anchorBounds).not.toBeNull();
  expect(popupBounds).not.toBeNull();
  if (!anchorBounds || !popupBounds) throw new Error('Search controls are not positioned');
  expect(Math.abs(popupBounds.x - anchorBounds.x)).toBeLessThan(24);
  expect(popupBounds.y).toBeGreaterThanOrEqual(anchorBounds.y + anchorBounds.height - 1);
  await captureLightAndDark(page, 'desktop-search-open');

  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await search.fill('Compare CLI contracts');
  await expect(popup).toBeVisible();
  const headingBounds = await page.locator('#main-content h1').boundingBox();
  if (!headingBounds) throw new Error('Document heading is not visible behind search');
  await page.mouse.click(
    headingBounds.x + headingBounds.width / 2,
    headingBounds.y + headingBounds.height / 2,
  );
  await expect(popup).toBeHidden();

  await page.keyboard.press('Control+k');
  await expect(search).toBeFocused();
  await search.fill('Compare CLI contracts');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/project\/docs\/use-cases\/UC-COMPAT\.html$/u);
  await expect(page.getByRole('heading', { name: /Compare CLI contracts/u })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./modules/core.html');
  const mobileToc = page.locator('.document-toc');
  await expect(mobileToc).not.toHaveAttribute('open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureLightAndDark(page, 'mobile-document');
  await mobileToc.locator('summary').click();
  await expect(mobileToc).toHaveAttribute('open', '');
  await page.getByRole('combobox', { name: 'Search' }).fill('Compare CLI contracts');
  await expect(popup).toBeVisible();
  await captureLightAndDark(page, 'mobile-search-open');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
});

test('docked agent shrinks the page, resizes, and leaves terminal stopped until requested', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4175/architecture/overview.html');
  const content = page.locator('#main-content');
  const sidebar = page.locator('.sidebar');
  const panel = page.locator('aside.agent-console');
  await expect(sidebar).toBeVisible();
  await expect(content).toBeVisible();
  const contentBefore = await content.boundingBox();
  if (!contentBefore) throw new Error('Document content is not visible');

  const discussionPanel = page.locator('.discussion-panel');
  const contextualDiscussion = page.locator('.document-actions button[aria-label="Discussions"]');
  await contextualDiscussion.click();
  await expect(discussionPanel).toHaveClass(/is-open/u);
  await expect(page.locator('.discussion-composer textarea')).toBeVisible();
  await page.locator('#agent-console-toggle').click();
  await expect(panel).toBeVisible();
  await expect(discussionPanel).not.toHaveClass(/is-open/u);
  await expect(page.locator('dialog, [aria-modal="true"]')).toHaveCount(0);
  await contextualDiscussion.click();
  await expect(panel).toBeHidden();
  await expect(discussionPanel).toHaveClass(/is-open/u);
  await discussionPanel.locator('.discussion-thread-actions button').last().click();
  await expect(discussionPanel).not.toHaveClass(/is-open/u);
  await page.locator('#agent-console-toggle').click();
  await expect(panel).toBeVisible();
  const panelBefore = await panel.boundingBox();
  const contentDocked = await content.boundingBox();
  if (!panelBefore || !contentDocked) throw new Error('Docked console or page is not visible');
  expect(contentDocked.width).toBeLessThan(contentBefore.width);
  expect(contentDocked.x + contentDocked.width).toBeLessThanOrEqual(panelBefore.x);

  const resizer = page.locator('.agent-console-resizer');
  const handle = await resizer.boundingBox();
  if (!handle) throw new Error('Agent panel resize handle is not visible');
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 - 64, handle.y + 50);
  await page.mouse.up();
  await expect
    .poll(() => panel.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(panelBefore.width + 40);
  const contentResized = await content.boundingBox();
  const panelResized = await panel.boundingBox();
  if (!contentResized || !panelResized) throw new Error('Resized layout is not visible');
  expect(contentResized.width).toBeLessThan(contentDocked.width);
  expect(contentResized.x + contentResized.width).toBeLessThanOrEqual(panelResized.x);
  await captureLightAndDark(page, 'desktop-agent-open');

  await expect(page.locator('.console-mode-switch')).toHaveCount(0);
  await expect(page.locator('.agent-configuration')).not.toHaveAttribute('open');
  await page.locator('.agent-configuration > summary').click();
  await expect(page.getByRole('combobox', { name: 'Model' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Access' })).toBeVisible();
  await page.getByRole('button', { name: 'Project terminal' }).click();
  await expect(page.getByRole('button', { name: 'Start terminal' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop terminal' })).toBeHidden();
  await page.getByRole('button', { name: 'Agent' }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#agent-console-toggle').click();
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(sidebar).toBeVisible();
  await expect(content).toBeVisible();
  await page.locator('#agent-console-toggle').click();
  await expect(panel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureLightAndDark(page, 'mobile-agent-open');
});

test('workbench adapts to mobile and keeps native navigation usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Current work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Knowledge' })).toBeVisible();
  await page.locator('.navigation-disclosure > summary').click();
  await page
    .locator('.nav-group')
    .filter({ hasText: 'Architecture' })
    .locator('summary')
    .press('Enter');
  await page.locator('.sidebar a[href="architecture/overview.html"]').click();
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await expect(page.locator('.navigation-disclosure')).not.toHaveAttribute('open');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.evaluate(() => {
    document.documentElement.dataset.colorScheme = 'dark';
  });
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('navigates and searches through React Router', async ({ page }) => {
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests += 1;
  });
  await page.goto('./');
  await page
    .locator('.nav-group')
    .filter({ hasText: 'Architecture' })
    .locator('summary')
    .press('Enter');
  await page.locator('.sidebar a[href="architecture/overview.html"]').click();
  await expect(page).toHaveURL(/\/project\/docs\/architecture\/overview\.html$/u);
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await expect(page.locator('main svg').first()).toBeVisible();
  expect(documentRequests).toBe(1);

  await page.goto('./search.html');
  await page.getByRole('textbox').fill('task');
  await expect(page.locator('main').getByRole('link').first()).toBeVisible();
});

test('resizes and persists the sidebar, shows task states, and contains mobile content', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('./');
  const sidebar = page.locator('.sidebar');
  const resizer = page.getByRole('separator', { name: 'Resize navigation' });
  const initialWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  const bounds = await resizer.boundingBox();
  if (!bounds) throw new Error('Sidebar resize handle is not visible');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 40);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + 40);
  await page.mouse.up();

  await expect
    .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(initialWidth + 50);
  const resizedWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width);
  expect(await page.evaluate(() => localStorage.getItem('toudocu-sidebar-width'))).toBe(
    String(resizedWidth),
  );
  await page.reload();
  await expect
    .poll(() => sidebar.evaluate((element) => element.getBoundingClientRect().width))
    .toBeCloseTo(resizedWidth, 0);
  await expect(resizer).toHaveAttribute('aria-valuenow', String(resizedWidth));

  await page.locator('.nav-group').filter({ hasText: 'Tasks' }).locator('summary').press('Enter');
  await expect(page.locator('.nav-status[data-status="done"]')).toBeVisible();
  await expect(page.locator('.nav-status[data-status="not-started"]')).toBeVisible();
  await page.getByRole('link', { name: 'Tasks', exact: true }).click();
  await expect(page).toHaveURL(/\/project\/docs\/work\/index\.html$/u);
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.locator('.page')).toHaveClass(/page-home/u);
  await page.screenshot({ path: '/tmp/toudocu-sidebar-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/toudocu-sidebar-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('opens workspace settings, dismisses the popover, and keeps static/live headers within mobile width', async ({
  page,
}) => {
  const settingsButton = page
    .locator('.site-header')
    .getByRole('button', { name: 'View and tools' });
  const settings = page.locator('#workspace-settings');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await expect(settingsButton).toBeVisible();
  await expect(settings).toBeHidden();
  await expect(page.getByRole('button', { name: 'Agent' })).toHaveCount(0);
  await settingsButton.click();
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeHidden();

  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByLabel('Interface density').selectOption('compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('heading', { name: 'Compatibility fixture' }).click();
  await expect(settings).toBeHidden();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/toudocu-header-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:4175/architecture/overview.html');
  await expect(page.getByRole('button', { name: 'Agent' })).toBeVisible();
  await expect(
    page.locator('.site-header').getByRole('button', { name: 'View and tools' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/toudocu-header-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.global-search kbd')).toBeHidden();
  const mobileSearchBounds = await page.locator('.global-search').boundingBox();
  const mobileAgentBounds = await page.getByRole('button', { name: 'Agent' }).boundingBox();
  expect(mobileSearchBounds).not.toBeNull();
  expect(mobileAgentBounds).not.toBeNull();
  if (!mobileSearchBounds || !mobileAgentBounds)
    throw new Error('Mobile header controls are missing');
  expect(mobileAgentBounds.y + mobileAgentBounds.height).toBeLessThanOrEqual(mobileSearchBounds.y);
  await page.screenshot({ path: '/tmp/toudocu-header-mobile.png', fullPage: true });
});

test('mobile navigation stays inside the available viewport and scrolls to project tools', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.goto('./');
  await page.locator('.navigation-disclosure > summary').click();
  const sidebar = page.locator('.sidebar');
  const bounds = await sidebar.boundingBox();
  if (!bounds) throw new Error('Navigation is missing');
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(500);
  const roadmap = sidebar.getByRole('link', { name: 'Roadmap' });
  await roadmap.scrollIntoViewIfNeeded();
  await roadmap.click();
  await expect(page).toHaveURL(/roadmap\.html$/u);
});

test('live portal remains usable when browser preferences are unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
  });
  await page.goto('http://127.0.0.1:4175/architecture/overview.html');
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await page.getByRole('button', { name: 'Agent', exact: true }).click();
  await expect(page.locator('aside.agent-console')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keeps generated routes readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Compatibility fixture' })).toBeVisible();

  await page
    .locator('.nav-group')
    .filter({ hasText: 'Architecture' })
    .locator('summary')
    .press('Enter');
  await page.locator('.sidebar a[href="architecture/overview.html"]').click();
  await expect(page).toHaveURL(/\/project\/docs\/architecture\/overview\.html$/u);
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await expect(page.getByText('flowchart LR')).toBeVisible();

  await page
    .getByRole('link', { name: /Core module/u })
    .last()
    .click();
  await expect(page).toHaveURL(/\/project\/docs\/modules\/core\.html$/u);
  await expect(page.getByRole('heading', { name: 'Core module' })).toBeVisible();

  await page
    .locator('.nav-group')
    .filter({ has: page.locator('summary', { hasText: /^Tasks/u }) })
    .locator('summary')
    .press('Enter');
  await page
    .getByRole('link', { name: /Implement the compatibility path/u })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: /Implement the compatibility path/u }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Roadmap' }).click();
  await expect(page.getByText('Publish the static portal.')).toBeVisible();
  await context.close();
});

test('keeps document title, prose and relations on one axis at desktop and mobile widths', async ({
  page,
}) => {
  const canonical = 'http://127.0.0.1:4177';
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${canonical}/modules/site.html`);
  await expect(page.locator('.document-body')).toBeVisible();
  const geometry = await page.locator('.document-prose').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return { left: rect.left, right: rect.right, marginLeft: style.marginLeft };
  });
  expect(geometry.left).toBeGreaterThan(0);
  expect(geometry.right).toBeLessThan(1440);
  const titleBounds = await page.locator('.document-header h1').boundingBox();
  const relatedBounds = await page.locator('.relations-section').first().boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(relatedBounds).not.toBeNull();
  expect(Math.abs(geometry.left - titleBounds!.x)).toBeLessThan(2);
  expect(Math.abs(geometry.left - relatedBounds!.x)).toBeLessThan(2);
  await expect(page.locator('.document-header h1')).toHaveCSS('font-size', '28px');
  await expect(page.locator('.document-header')).toHaveCSS('border-radius', '0px');
  await page.screenshot({ path: '/tmp/toudocu-document-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${canonical}/modules/site.html`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('.document-body')).toBeVisible();
  await page.screenshot({ path: '/tmp/toudocu-document-mobile.png' });
});

test('top-level collections stay inside desktop and narrow viewports', async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      '/',
      '/work/index.html',
      '/use-cases/index.html',
      '/processes/index.html',
      '/traceability.html',
      '/health.html',
      '/roadmap.html',
    ]) {
      await page.goto(`http://127.0.0.1:4177${route}`);
      await expect(page.locator('#main-content')).toBeVisible();
      await expect(page.locator('.page-not-found')).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${route} at ${width}px`,
      ).toBe(true);
    }
  }
});

test('renders canonical screen map and Mermaid gestures at desktop and mobile widths', async ({
  page,
}) => {
  const canonical = 'http://127.0.0.1:4177';
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${canonical}/screens/index.html`);
  const map = page.locator('.screen-map');
  await expect(map).toBeVisible();
  const previews = map.locator('.screen-map-preview[src]');
  await expect(previews.first()).toBeVisible();
  const zoomValue = map.locator('.screen-map-zoom button').nth(1);
  const initialZoom = await zoomValue.textContent();
  const scroll = map.locator('.screen-map-scroll');
  await scroll.scrollIntoViewIfNeeded();
  const scrollBounds = await scroll.boundingBox();
  if (!scrollBounds) throw new Error('Screen map scroller is not visible');
  await page.mouse.move(
    scrollBounds.x + scrollBounds.width / 2,
    scrollBounds.y + scrollBounds.height / 2,
  );
  await page.mouse.wheel(0, -240);
  await expect.poll(() => zoomValue.textContent()).not.toBe(initialZoom);
  await map.locator('.screen-map-heading button').nth(1).click();
  await expect(map.locator('.screen-catalog-table')).toBeVisible();
  await map.locator('.screen-map-heading button').nth(0).click();
  await expect(scroll).toBeVisible();
  const restoredZoom = await zoomValue.textContent();
  const restoredBounds = await scroll.boundingBox();
  if (!restoredBounds) throw new Error('Screen map scroller did not return');
  await page.mouse.move(
    restoredBounds.x + restoredBounds.width / 2,
    restoredBounds.y + restoredBounds.height / 2,
  );
  await page.mouse.wheel(0, -180);
  await expect.poll(() => zoomValue.textContent()).not.toBe(restoredZoom);
  await page.screenshot({ path: '/tmp/toudocu-screenmap-canonical.png', fullPage: true });
  await expect
    .poll(() => previews.first().evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  const edges = map.locator('svg path[marker-end]');
  await expect.poll(() => edges.count()).toBeGreaterThan(0);
  const edgeStyle = await edges.first().evaluate((element) => {
    const path = element as SVGPathElement;
    return {
      visibility: getComputedStyle(path).visibility,
      stroke: getComputedStyle(path).stroke,
      bounds: (() => {
        const { width, height } = path.getBBox();
        return { width, height };
      })(),
    };
  });
  expect(edgeStyle.visibility).toBe('visible');
  expect(edgeStyle.stroke).not.toBe('none');
  expect(edgeStyle.bounds.width + edgeStyle.bounds.height).toBeGreaterThan(0);

  const labels = map.locator('.screen-map-edge-label');
  const clickableLabel = await labels.evaluateAll((elements) =>
    elements.findIndex((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === element || (hit instanceof Node && element.contains(hit));
    }),
  );
  expect(clickableLabel).toBeGreaterThanOrEqual(0);
  const edgeLabel = labels.nth(clickableLabel);
  await edgeLabel.click();
  await expect(map.locator('.transition-inspector')).toBeVisible();
  await map.screenshot({ path: '/tmp/toudocu-screenmap-transition-inspector.png' });
  await map
    .locator('.transition-inspector')
    .getByRole('button', { name: /close|закрыть/i })
    .click();
  await map.locator('.screen-map-node').first().getByRole('button').click();
  await expect(map.locator('.screen-map-inspector:not(.transition-inspector)')).toBeVisible();
  await map
    .locator('.screen-map-inspector:not(.transition-inspector)')
    .getByRole('button', { name: /close|закрыть/i })
    .click();
  await map.getByRole('button', { name: /fit|вписать/i }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${canonical}/screens/index.html`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/toudocu-screenmap-mobile.png', fullPage: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${canonical}/architecture/agent-feedback-delivery.html`);
  const mermaid = page.locator('.mermaid-frame:visible').first();
  await expect(mermaid).toBeVisible();
  const mermaidViewport = page.locator('.mermaid-viewport:visible').first();
  await mermaidViewport.scrollIntoViewIfNeeded();
  const mermaidBounds = await mermaidViewport.boundingBox();
  if (!mermaidBounds) throw new Error('Mermaid viewport is not visible');
  const beforeWheel = await mermaid.getAttribute('data-mermaid-scale');
  await page.mouse.move(
    mermaidBounds.x + mermaidBounds.width / 2,
    mermaidBounds.y + mermaidBounds.height / 2,
  );
  await page.mouse.wheel(0, -200);
  await expect.poll(() => mermaid.getAttribute('data-mermaid-scale')).not.toBe(beforeWheel);

  const cdp = await page.context().newCDPSession(page);
  const center = {
    x: Math.round(mermaidBounds.x + mermaidBounds.width / 2),
    y: Math.round(mermaidBounds.y + mermaidBounds.height / 2),
  };
  const beforePinch = await mermaid.getAttribute('data-mermaid-scale');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: center.x - 35, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
      { id: 2, x: center.x + 35, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { id: 1, x: center.x - 75, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
      { id: 2, x: center.x + 75, y: center.y, radiusX: 3, radiusY: 3, force: 1 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => mermaid.getAttribute('data-mermaid-scale')).not.toBe(beforePinch);
  await cdp.detach();

  await page.goto(`${canonical}/use-cases/UC-DOCS-05.html`);
  await page.getByRole('button', { name: /map|карта/i }).click();
  await expect(page.locator('.use-case-mode .screen-map')).toBeVisible();
  await expect.poll(() => page.locator('.mermaid-frame svg').count()).toBeGreaterThan(0);
});

test('serves deep SPA routes and one revision through the live API', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4175') {
      externalRequests.push(request.url());
    }
  });
  await page.goto('http://127.0.0.1:4175/architecture/overview.html');
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4175/_toudocu/editor/');
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();

  const state = await page.request.get('http://127.0.0.1:4175/_toudocu/api/state');
  await expect(state).toBeOK();
  expect(await state.json()).toMatchObject({ revision: 1, rebuilding: false });

  const rebuilt = await page.request.post('http://127.0.0.1:4175/_toudocu/api/rebuild', {
    headers: { 'x-toudocu-action': 'rebuild', 'sec-fetch-site': 'same-origin' },
  });
  await expect(rebuilt).toBeOK();
  expect(await rebuilt.json()).toMatchObject({ revision: 2, rebuilding: false });
  expect(externalRequests).toEqual([]);
});

test('keeps the Agent Console and Project Terminal across SPA navigation', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/architecture/overview.html');
  await page.locator('#agent-console-toggle').click();
  await expect(page.locator('aside.agent-console')).toBeVisible();
  await page.getByRole('button', { name: 'Project terminal' }).click();
  await expect(page.getByRole('button', { name: 'Start terminal' })).toBeVisible();
  await page.getByRole('button', { name: 'Start terminal' }).click();
  await expect(page.getByRole('button', { name: 'Stop terminal' })).toBeVisible();

  await page.getByRole('link', { name: 'Editor' }).click();
  await expect(page.getByRole('button', { name: 'Stop terminal' })).toBeVisible();

  await page.getByRole('button', { name: 'Stop terminal' }).click();
  await expect(page.getByRole('button', { name: 'Start terminal' })).toBeVisible();
});

test('edits, reviews changes, and queues discussions through the live SPA', async ({ page }) => {
  await page.goto('http://127.0.0.1:4175/_toudocu/editor/');
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Compatibility fixture' }).click();
  await expect(page.getByRole('textbox', { name: 'index.md' })).toBeVisible();

  const opened = await page.request.get(
    'http://127.0.0.1:4175/_toudocu/api/editor/file?path=index.md',
  );
  await expect(opened).toBeOK();
  const original = await opened.json();
  const updatedContent = `${original.file.content}\nBrowser edit.\n`;
  const saved = await page.request.put('http://127.0.0.1:4175/_toudocu/api/editor/file', {
    headers: { 'x-toudocu-action': 'save', 'sec-fetch-site': 'same-origin' },
    data: {
      path: 'index.md',
      content: updatedContent,
      expectedDigest: original.file.digest,
      confirmOverwrite: false,
    },
  });
  await expect(saved).toBeOK();
  const stale = await page.request.put('http://127.0.0.1:4175/_toudocu/api/editor/file', {
    headers: { 'x-toudocu-action': 'save', 'sec-fetch-site': 'same-origin' },
    data: {
      path: 'index.md',
      content: '# Lost update\n',
      expectedDigest: original.file.digest,
      confirmOverwrite: false,
    },
  });
  expect(stale.status()).toBe(409);
  expect((await stale.json()).error.details.content).toBe(updatedContent);

  await page.goto('http://127.0.0.1:4175/_toudocu/changes/');
  await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
  await expect(page.getByText(/index\.md/u).first()).toBeVisible();

  const review = await page.request.get('http://127.0.0.1:4175/_toudocu/api/agent/discussions');
  const reviewState = await review.json();
  const created = await page.request.post('http://127.0.0.1:4175/_toudocu/api/agent/discussions', {
    headers: {
      'x-toudocu-action': 'agent-discussion-create',
      'sec-fetch-site': 'same-origin',
    },
    data: {
      expectedRevision: reviewState.revision,
      expectedStateDigest: reviewState.stateDigest,
      target: { kind: 'document', path: 'docs/index.md' },
      intent: 'question',
      text: 'Please review the browser edit.',
    },
  });
  await expect(created).toBeOK();
  await page.goto('http://127.0.0.1:4175/_toudocu/discussions/');
  await expect(
    page.locator('#main-content').getByText('Please review the browser edit.'),
  ).toBeVisible();
});
