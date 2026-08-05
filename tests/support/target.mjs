import { request as playwrightRequest } from '@playwright/test';

const CURRENT_PUBLIC_GATEWAY = 'https://54.91.17.58';
const PREVIOUS_PUBLIC_GATEWAY = 'https://98.90.186.114';
const INTERNAL_CANDIDATES = [
  'http://dd-des-web.default.svc.cluster.local:8130',
  'http://dd-des-simulator.default.svc.cluster.local:8099',
];
const ACCEPTABLE_BOUNDARY_STATUSES = new Set([301, 302, 303, 307, 308, 401, 403]);
const SERVICE_LOCAL_MODES = new Set(['internal', 'fixture']);

function clean(value) {
  return String(value ?? '').trim().replace(/\/+$/, '');
}

function candidateList() {
  const explicit = clean(process.env.DES_BASE_URL);
  const configuredPublic = clean(process.env.DES_PUBLIC_BASE_URL);
  return [...new Set([
    explicit,
    ...INTERNAL_CANDIDATES,
    configuredPublic,
    CURRENT_PUBLIC_GATEWAY,
    PREVIOUS_PUBLIC_GATEWAY,
  ].filter(Boolean))];
}

function isInternal(baseURL) {
  return baseURL.includes('.svc.cluster.local') || /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|$)/.test(baseURL);
}

function headersFor(baseURL) {
  const gatewayAuth = String(process.env.DES_GATEWAY_AUTH ?? '').trim();
  if (!gatewayAuth || isInternal(baseURL)) return {};
  return { cookie: `dd_auth=${gatewayAuth}`, auth: gatewayAuth };
}

export async function resolveTarget() {
  const failures = [];
  for (const baseURL of candidateList()) {
    const client = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: headersFor(baseURL),
    });
    try {
      if (isInternal(baseURL)) {
        for (const path of ['/healthz', '/api/v1/catalog', '/']) {
          try {
            const response = await client.get(`${baseURL}${path}`, {
              failOnStatusCode: false,
              maxRedirects: 0,
              timeout: 4_000,
            });
            if (response.status() >= 200 && response.status() < 500) {
              return { baseURL, mode: 'internal', probePath: path, probeStatus: response.status() };
            }
          } catch (error) {
            failures.push(`${baseURL}${path}: ${error.message}`);
          }
        }
      } else {
        const response = await client.get(`${baseURL}/des/`, {
          failOnStatusCode: false,
          maxRedirects: 0,
          timeout: 8_000,
        });
        if (response.ok()) {
          return {
            baseURL,
            mode: process.env.DES_GATEWAY_AUTH ? 'public-authenticated' : 'public-open',
            probePath: '/des/',
            probeStatus: response.status(),
          };
        }
        if (ACCEPTABLE_BOUNDARY_STATUSES.has(response.status())) {
          return { baseURL, mode: 'public-auth-boundary', probePath: '/des/', probeStatus: response.status() };
        }
        failures.push(`${baseURL}/des/: HTTP ${response.status()}`);
      }
    } catch (error) {
      failures.push(`${baseURL}: ${error.message}`);
    } finally {
      await client.dispose();
    }
  }
  throw new Error(`No DES target was reachable. ${failures.join(' | ')}`);
}

export function resolvedTarget() {
  const baseURL = clean(process.env.DES_RESOLVED_BASE_URL);
  const mode = clean(process.env.DES_TARGET_MODE);
  if (!baseURL || !mode) throw new Error('DES target was not initialized by global setup');
  return { baseURL, mode };
}

export function usesServiceLocalPaths(mode = resolvedTarget().mode) {
  return SERVICE_LOCAL_MODES.has(mode);
}

export function pathForTarget(publicPath) {
  if (!usesServiceLocalPaths()) return publicPath;
  if (publicPath === '/des' || publicPath === '/des/') return '/';
  if (publicPath.startsWith('/des/')) return publicPath.slice('/des'.length);
  return publicPath;
}

export function targetRequestOptions(options = {}) {
  if (!usesServiceLocalPaths()) return options;
  return {
    ...options,
    headers: {
      'X-Forwarded-Prefix': '/des',
      ...(options.headers ?? {}),
    },
  };
}

export async function configureBrowserContext(context) {
  const { baseURL, mode } = resolvedTarget();
  if (usesServiceLocalPaths(mode)) {
    await context.setExtraHTTPHeaders({ 'X-Forwarded-Prefix': '/des' });
    return;
  }
  const value = String(process.env.DES_GATEWAY_AUTH ?? '').trim();
  if (value && mode === 'public-authenticated') {
    await context.addCookies([{ name: 'dd_auth', value, url: baseURL }]);
  }
}
