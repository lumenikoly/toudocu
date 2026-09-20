import { expect, test } from '@playwright/test';

test('navigates and searches through React Router', async ({ page }) => {
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.resourceType() === 'document') documentRequests += 1;
  });
  await page.goto('./');
  await page.locator('a[href="architecture/overview.html"]').click();
  await expect(page).toHaveURL(/\/project\/docs\/architecture\/overview\.html$/u);
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await expect(page.locator('main svg').first()).toBeVisible();
  expect(documentRequests).toBe(1);

  await page.goto('./search.html');
  await page.getByRole('textbox').fill('task');
  await expect(page.locator('main').getByRole('link').first()).toBeVisible();
});

test('keeps generated routes readable without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Compatibility fixture' })).toBeVisible();

  await page.locator('a[href="architecture/overview.html"]').click();
  await expect(page).toHaveURL(/\/project\/docs\/architecture\/overview\.html$/u);
  await expect(page.getByRole('heading', { name: 'Architecture' })).toBeVisible();
  await expect(page.getByText('flowchart LR')).toBeVisible();

  await page.getByRole('link', { name: 'Core module' }).last().click();
  await expect(page).toHaveURL(/\/project\/docs\/modules\/core\.html$/u);
  await expect(page.getByRole('heading', { name: 'Core module' })).toBeVisible();

  await page.getByRole('link', { name: 'Implement the compatibility path' }).click();
  await expect(
    page.getByRole('heading', { name: /Implement the compatibility path/u }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Roadmap' }).click();
  await expect(page.getByText('Publish the static portal.')).toBeVisible();
  await context.close();
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
  await page.getByRole('button', { name: 'Agent and terminal' }).click();
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
  await expect(page.getByText('Please review the browser edit.')).toBeVisible();
});
