import { expect, test } from '@playwright/test';
import {
  configureBrowserContext,
  pathForTarget,
  resolvedTarget,
  targetRequestOptions,
} from './support/target.mjs';

const NAVIGATION_ROUTES = [
  '/des/',
  '/des/models',
  '/des/games/soccer',
  '/des/games/elevator',
  '/des/tools/routing',
];

function full(publicPath) {
  return `${resolvedTarget().baseURL}${pathForTarget(publicPath)}`;
}

function fullAccessAvailable() {
  return resolvedTarget().mode !== 'public-auth-boundary';
}

function boundedFailureText(text) {
  expect(text).not.toMatch(/panicked at|stack backtrace|internal server error/i);
  expect(text.length).toBeLessThan(64 * 1024);
}

test.beforeEach(async ({ context }) => {
  await configureBrowserContext(context);
});

test('canonical pages survive reload and browser history transitions', async ({ page }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const models = await page.goto(full('/des/models?source=playwright#models'), {
    waitUntil: 'domcontentloaded',
  });
  expect(models).not.toBeNull();
  expect(models.status()).toBeLessThan(400);
  expect(page.url()).toContain('source=playwright');
  expect(page.url()).toContain('#models');

  const reloaded = await page.reload({ waitUntil: 'domcontentloaded' });
  expect(reloaded).not.toBeNull();
  expect(reloaded.status()).toBeLessThan(400);
  await expect(page.locator('body')).not.toContainText(/application error|panicked at/i);

  await page.goto(full('/des/games/soccer'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/soccer|match|tournament/i);

  await page.goBack({ waitUntil: 'domcontentloaded' });
  expect(page.url()).toContain('source=playwright');
  await expect(page.locator('body')).toContainText(/model|simulation/i);

  await page.goForward({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText(/soccer|match|tournament/i);
});

test('HTML navigation does not load cross-origin active content', async ({ page }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const targetOrigin = new URL(resolvedTarget().baseURL).origin;
  const activeOrigins = new Set();
  page.on('request', (request) => {
    if (!['document', 'script', 'stylesheet', 'font', 'xhr', 'fetch'].includes(request.resourceType())) {
      return;
    }
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol)) activeOrigins.add(url.origin);
  });

  for (const route of NAVIGATION_ROUTES) {
    const response = await page.goto(full(route), { waitUntil: 'domcontentloaded' });
    expect(response, `missing response for ${route}`).not.toBeNull();
    expect(response.status(), `${route} returned ${response.status()}`).toBeLessThan(400);
  }

  expect([...activeOrigins]).toEqual([targetOrigin]);
});

test('malformed solver JSON fails before upstream or database work', async ({ request }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const response = await request.post(
    full('/des/api/v1/solve'),
    targetRequestOptions({
      data: '{"nodes":[',
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { 'content-type': 'application/json' },
    }),
  );

  expect([400, 415, 422]).toContain(response.status());
  boundedFailureText(await response.text());
});

test('read-only endpoints reject unsupported methods without server errors', async ({ request }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const cases = [
    ['post', '/des/api/v1/catalog'],
    ['delete', '/des/healthz'],
    ['patch', '/des/readyz'],
  ];

  for (const [method, route] of cases) {
    const response = await request[method](
      full(route),
      targetRequestOptions({ failOnStatusCode: false, maxRedirects: 0 }),
    );
    expect([404, 405]).toContain(response.status());
    boundedFailureText(await response.text());
  }
});

test('encoded path-confusion attempts cannot escape the DES route boundary', async ({ request }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const attempts = [
    '/des/%2e%2e%2fhealthz',
    '/des/%2e%2e/%2e%2e/etc/passwd',
    '/des/tools/%2e%2e%2fapi%2fv1%2fcatalog',
  ];

  for (const route of attempts) {
    const response = await request.get(
      full(route),
      targetRequestOptions({ failOnStatusCode: false, maxRedirects: 0 }),
    );
    expect([400, 404]).toContain(response.status());
    const text = await response.text();
    boundedFailureText(text);
    expect(text).not.toContain('"service":"des-web"');
    expect(text).not.toContain('"schema":"des.route-catalog.v1"');
  }
});

test('success and error responses publish explicit content types and hardening headers', async ({ request }) => {
  test.skip(!fullAccessAvailable(), 'Public target is intentionally unauthenticated');

  const catalog = await request.get(
    full('/des/api/v1/catalog'),
    targetRequestOptions({ failOnStatusCode: false }),
  );
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['content-type']).toMatch(/^application\/json\b/i);

  const page = await request.get(
    full('/des/models'),
    targetRequestOptions({ failOnStatusCode: false }),
  );
  expect(page.status()).toBe(200);
  expect(page.headers()['content-type']).toMatch(/^text\/html\b/i);

  const missing = await request.get(
    full('/des/definitely-not-a-route'),
    targetRequestOptions({ failOnStatusCode: false }),
  );
  expect([404, 405]).toContain(missing.status());

  for (const response of [catalog, page, missing]) {
    const headers = response.headers();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toMatch(/deny|sameorigin/i);
  }
});
