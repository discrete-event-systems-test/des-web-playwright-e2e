import { test, expect } from "@playwright/test";

const sharedLayoutPages = [
  ["/", "Discrete-event sims & games"],
  ["/models", "Models"],
  ["/games/soccer", "Soccer"],
  ["/games/elevator", "Elevator"],
];

test("liveness publishes the DES service contract", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.status()).toBe(200);
  const health = await response.json();
  expect(health).toMatchObject({
    ok: true,
    service: "des-web",
    publicBasePath: "/des",
  });
  expect(typeof health.db).toBe("boolean");
});

test("readiness is explicit even in degraded mode", async ({ request }) => {
  const response = await request.get("/readyz");
  expect([200, 503]).toContain(response.status());
  const readiness = await response.json();
  expect(typeof readiness.ready).toBe("boolean");
  expect(response.status()).toBe(readiness.ready ? 200 : 503);
});

for (const [path, heading] of sharedLayoutPages) {
  test(`${path} renders a shared-layout page`, async ({ page }) => {
    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.locator("header .brand")).toContainText("des-web");
    await expect(
      page
        .getByRole("heading", { name: new RegExp(heading, "i") })
        .first(),
    ).toBeVisible();
  });
}

test("routing tool renders its self-contained solver dashboard", async ({ page }) => {
  const response = await page.goto("/tools/routing", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/Optimal routing/i);
  await expect(page.getByRole("heading", { name: /optimal routing/i })).toBeVisible();
  await expect(page.locator("#form")).toBeVisible();
  await expect(page.locator("#status")).toHaveText("idle");
  await expect(page.locator("#canvas")).toBeVisible();
});

test("mounted-mode HTML publishes only canonical /des navigation", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const hrefs = await page.locator("header nav a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );
  expect(hrefs.length).toBeGreaterThan(4);
  expect(
    hrefs.every(
      (href) =>
        typeof href === "string" &&
        (href === "/des" || href.startsWith("/des/")),
    ),
  ).toBe(true);
});

test("service-local htmx partial remains available behind the gateway mount", async ({ request }) => {
  const response = await request.get("/partials/sims");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("Soccer rotation planner");
  expect(html).toContain("/des/games/soccer/planner");
});

test("catalog API publishes the canonical route envelope without Postgres", async ({ request }) => {
  const response = await request.get("/api/v1/catalog");
  expect(response.status()).toBe(200);
  const catalog = await response.json();
  expect(catalog).toMatchObject({
    schema: "des.route-catalog.v1",
    basePath: "/des",
    pages: {
      routing: "/des/tools/routing",
      soccer: "/des/games/soccer",
      elevator: "/des/games/elevator",
    },
    api: {
      catalog: "/des/api/v1/catalog",
    },
    ownership: {
      application: "discrete-event-systems/des-web.rs",
    },
  });
});

test("responses carry browser hardening headers", async ({ page }) => {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

test("unknown paths render the application 404", async ({ page }) => {
  const response = await page.goto("/not-a-real-des-route", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(404);
  await expect(page.getByText("404").first()).toBeVisible();
});
