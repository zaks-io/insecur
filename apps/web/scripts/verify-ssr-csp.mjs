// SSR / CSP conformance probe for the built Web BFF. Boots dist/server under Miniflare with
// stubbed API/RUNTIME bindings and asserts every SSR surface (public pages and the authed console
// shell) renders with a matching CSP nonce and zero inline style attributes. Miniflare is used
// directly because `unstable_dev` cannot carry function service bindings or an RPC entrypoint stub.
//
// Gate wiring (INS-369): runs as `@insecur/web` `test:e2e` (turbo `@insecur/web#test:e2e` depends
// on `build`), so `pnpm test:e2e` and CI's postgres-integration job execute it against the real
// built worker — the same layer as the API Worker's e2e loop. It is deliberately NOT part of
// `pnpm verify`: the full vite build + wrangler dry-run + Miniflare boot is too slow for the
// pre-push/verify hot path. Run manually with `pnpm --filter @insecur/web build && node
// scripts/verify-ssr-csp.mjs`.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Miniflare } = await import(
  require.resolve("miniflare", { paths: [require.resolve("wrangler/package.json")] })
);

const SESSION_SIGNING_SECRET = "b".repeat(32);
const USER_ID = "usr_01JZ8E2QYQ6M7F4K9A2B3C4D5E";
const ORG = { organizationId: "org_01JZ8E2QYQAAAAAAAAAAAAAAAA", displayName: "Acme Corp" };

const base64Url = (bytes) =>
  Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

/** Mint the HS256 ephemeral session credential the preview-smoke path verifies. */
async function mintSmokeCredential() {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: USER_ID,
    wid: "user_ssr_csp_check",
    sid: "session_ssr",
    exp: now + 300,
    iat: now,
    typ: "insecur_cli_session_v1",
  };
  const encoder = new TextEncoder();
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64Url(encoder.encode(JSON.stringify(claims)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64Url(new Uint8Array(signature))}`;
}

const RUNTIME_STUB = `
import { WorkerEntrypoint } from "cloudflare:workers";
export class RuntimeStub extends WorkerEntrypoint {
  async resolveAdmission() {
    return { ok: true, value: { userId: "${USER_ID}" } };
  }
  async recordAdmissionDenied() {
    return { ok: true, value: { recorded: true } };
  }
}
export default { fetch: () => new Response(null, { status: 404 }) };
`;

const mf = new Miniflare({
  workers: [
    {
      name: "web",
      modules: true,
      modulesRoot: "dist/server",
      scriptPath: "dist/server/index.js",
      modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }],
      compatibilityDate: "2026-05-27",
      compatibilityFlags: ["nodejs_compat"],
      assets: { directory: "dist/client", routerConfig: { has_user_worker: true } },
      bindings: {
        WORKOS_API_KEY: "sk_test_fake",
        WORKOS_CLIENT_ID: "client_fake",
        WORKOS_COOKIE_PASSWORD: "a".repeat(32),
        SESSION_SIGNING_SECRET,
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
        INSTANCE_ID: "inst_LOCAL_DEV",
        // Ephemeral smoke credentials stand in for the WorkOS cookie so the authed console shell
        // can be exercised without a live IdP (same mechanism preview smoke uses).
        PREVIEW_SMOKE_SESSION_CREDENTIALS: "true",
      },
      serviceBindings: {
        API: async (request) => {
          const url = new URL(request.url);
          if (url.pathname === "/v1/session/memberships") {
            return Response.json({ ok: true, data: { organizations: [ORG] } });
          }
          if (url.pathname === "/v1/session/whoami") {
            return Response.json({
              ok: true,
              data: { actorType: "user", userId: USER_ID, sessionId: "session_ssr" },
            });
          }
          return Response.json({ ok: false, error: { code: "auth.required" } }, { status: 401 });
        },
        RUNTIME: { name: "runtime-stub", entrypoint: "RuntimeStub" },
      },
    },
    {
      name: "runtime-stub",
      modules: [{ type: "ESModule", path: "runtime-stub.mjs", contents: RUNTIME_STUB }],
      compatibilityDate: "2026-05-27",
    },
  ],
});

async function fetchPath(path, headers = {}) {
  return mf.dispatchFetch(`http://web.local${path}`, {
    headers: { accept: "text/html", ...headers },
    redirect: "manual",
  });
}

async function assertRouteHasMatchingCspNonce(path, { headers = {}, expect = [] } = {}) {
  const response = await fetchPath(path, headers);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  const csp = response.headers.get("content-security-policy");
  if (!csp) {
    throw new Error(`${path} missing Content-Security-Policy header`);
  }

  const nonceMatch = /'nonce-([^']+)'/.exec(csp);
  if (!nonceMatch) {
    throw new Error(`${path} CSP missing nonce directive: ${csp}`);
  }

  const nonce = nonceMatch[1];
  const html = await response.text();
  if (!html.includes(`id="$tsr-stream-barrier"`)) {
    throw new Error(`${path} missing TanStack stream barrier script`);
  }
  if (!html.includes(`nonce="${nonce}"`) && !html.includes(`nonce='${nonce}'`)) {
    throw new Error(`${path} inline scripts missing matching nonce attribute`);
  }
  // The nonce CSP blocks style attributes entirely: server-rendered markup must not carry any.
  if (/<[a-z][^>]*\sstyle="/i.test(html)) {
    throw new Error(`${path} server-rendered HTML carries an inline style attribute`);
  }
  for (const needle of expect) {
    if (!html.includes(needle)) {
      throw new Error(`${path} SSR HTML is missing expected content: ${needle}`);
    }
  }

  console.log(`ok ${path} nonce=${nonce}`);
}

async function assertUnauthenticatedConsoleRedirect(path) {
  const response = await fetchPath(path);
  const location = response.headers.get("location") ?? "";
  if (![302, 307].includes(response.status) || !location.startsWith("/login?returnTo=")) {
    throw new Error(`${path} expected a /login redirect, got ${response.status} ${location}`);
  }
  console.log(`ok ${path} -> ${location}`);
}

try {
  const authorization = { Authorization: `Bearer ${await mintSmokeCredential()}` };
  await assertRouteHasMatchingCspNonce("/");
  await assertRouteHasMatchingCspNonce("/login");
  await assertUnauthenticatedConsoleRedirect(`/orgs/${ORG.organizationId}`);
  await assertRouteHasMatchingCspNonce("/whoami", { headers: authorization });
  await assertRouteHasMatchingCspNonce(`/orgs/${ORG.organizationId}`, {
    headers: authorization,
    expect: [
      ORG.displayName,
      ORG.organizationId,
      ">Projects<",
      ">Audit<",
      ">People<",
      ">Settings<",
    ],
  });
  await assertRouteHasMatchingCspNonce(`/orgs/${ORG.organizationId}/audit`, {
    headers: authorization,
    expect: [ORG.displayName, 'aria-label="Breadcrumb"'],
  });
} finally {
  await mf.dispose();
}
