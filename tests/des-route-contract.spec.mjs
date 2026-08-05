import { expect, test } from '@playwright/test';
import {
  configureBrowserContext,
  pathForTarget,
  resolvedTarget,
  targetRequestOptions,
} from './support/target.mjs';

const ROUTES = [
  '/des/',
  '/des/models',
  '/des/games/soccer',
  '/des/games/soccer/planner',
  '/des/games/elevator',
  '/des/games/elevator/player',
  '/des/tools/routing',
  '/des/labs/factory-floor-track3t',
];

const CATALOG_ROUTES = ROUTES.filter((route) => route !== '/des/games/elevator/player');

const ROUTE_HINTS = new Map([
  ['/des/', /discrete|simulation|model|DES/i],
  ['/des/models', /model|simulation/i],
  ['/des/games/soccer', /soccer|match|tournament/i],
  ['/des/games/soccer/planner', /soccer|planner|schedule/i],
  ['/des/games/elevator', /elevator|floor|dispatch/i],
  ['/des/games/elevator/player', /elevator|player|floor/i],
  ['/des/tools/routing', /routing|route|solver/i],
  ['/des/labs/factory-floor-track3t', /factory|track|floor|3t/i],
]);

function full(publicPath) {
  return `${resolvedTarget().baseURL}${pathForTarget(publicPath)}`;
}

function fullAccessAvailable() {
  return resolvedTarget().mode !== 'public-auth-boundary';
}

test.beforeEach(async ({ context }) => {
  await configureBrowserContext(context);
});

test('public gateway enforces the DES authentication boundary', async ({ request, page }) => {
  test.skip(resolvedTarget().mode !== 'public-auth-boundary', 'Target provides full DES access');
  const response = await request.get(full('/des/'), { maxRedirects: 0, failOnStatusCode: false });
  expect([301, 302, 303, 307, 308, 401, 403]).toContain(response.status());
  if ([301, 302, 303, 307, 308].includes(response.status())) {
    expect(response.headers().location ?? '').toMatch(/^\/auth\?return=%?2Fdes%?2F|^\/auth\?return=\/des\//);
  }
  await page.goto(full('/des/'), { waitUntil: 'domcontentloaded' });
  expect(page.url()).toMatch(/\/auth(?:\?|$)/);
  await expect(page.locator('body')).toContainText(/auth|passphrase|sign in/i);
});

for (const route of ROUTES) {
  test(`canonical route ${route} renders`, async ({ page }) => {
    test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');
    const response = await page.goto(full(route), { waitUntil: 'domcontentloaded' });
    expect(response, `missing response for ${route}`).not.toBeNull();
    expect(response.status(), `${route} returned ${response.status()}`).toBeLessThan(400);
    await expect(page.locator('body')).toContainText(ROUTE_HINTS.get(route));
    await expect(page.locator('body')).not.toContainText(/application error|internal server error|panicked at/i);
  });
}

test('catalog advertises the canonical ownership surface', async ({ request }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');
  const response = await request.get(
    full('/des/api/v1/catalog'),
    targetRequestOptions({ failOnStatusCode: false }),
  );
  expect(response.ok(), `catalog returned ${response.status()}`).toBeTruthy();
  const text = await response.text();
  for (const route of CATALOG_ROUTES) expect(text).toContain(route);
  expect(text).toMatch(/discrete-event-systems|des-web/i);
});

test('HTML navigation preserves the /des ownership prefix', async ({ page }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');
  await page.goto(full('/des/'), { waitUntil: 'domcontentloaded' });
  const hrefs = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
  const local = hrefs.filter((href) => href && href.startsWith('/'));
  expect(local.length).toBeGreaterThan(0);
  for (const href of local) {
    expect(href, `navigation escaped DES ownership: ${href}`).toMatch(/^\/des(?:\/|$)|^\/(?:auth|assets|static)(?:\/|$)/);
  }
});

test('unknown DES route is a bounded client error', async ({ page }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');
  const response = await page.goto(full('/des/route-that-must-not-exist'), { waitUntil: 'domcontentloaded' });
  expect(response).not.toBeNull();
  expect([404, 405]).toContain(response.status());
  await expect(page.locator('body')).not.toContainText(/panicked at|stack backtrace/i);
});

test('gateway and application expose defensive response headers', async ({ request }) => {
  const publicPath = fullAccessAvailable() ? '/des/' : '/auth?return=/des/';
  const response = await request.get(
    full(publicPath),
    targetRequestOptions({ failOnStatusCode: false }),
  );
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toMatch(/sameorigin|deny/i);
});
