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
// A second membership whose project list is empty, to exercise the empty-state invitation.
const EMPTY_ORG = { organizationId: "org_01JZ8E2QYQBBBBBBBBBBBBBBBB", displayName: "Blank Co" };

const PROJECT = {
  projectId: "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5H",
  organizationId: ORG.organizationId,
  displayName: "Payments API",
  createdAt: "2026-07-01T00:00:00.000Z",
};
// A project with zero environments, to exercise the environments empty state.
const BARE_PROJECT = {
  projectId: "prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5J",
  organizationId: ORG.organizationId,
  displayName: "Bare Project",
  createdAt: "2026-07-02T00:00:00.000Z",
};
const ENVIRONMENTS = [
  {
    environmentId: "env_01JZ8E4R2P7M9N3K5T8V1X6Z0A",
    organizationId: ORG.organizationId,
    projectId: PROJECT.projectId,
    displayName: "production",
    lifecycleStage: "production",
    isProtected: true,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
  {
    environmentId: "env_01JZ8E4R2P7M9N3K5T8V1X6Z0B",
    organizationId: ORG.organizationId,
    projectId: PROJECT.projectId,
    displayName: "dev",
    lifecycleStage: "development",
    isProtected: false,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

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
            return Response.json({ ok: true, data: { organizations: [ORG, EMPTY_ORG] } });
          }
          if (url.pathname === `/v1/orgs/${ORG.organizationId}/projects`) {
            return Response.json({ ok: true, data: { projects: [PROJECT, BARE_PROJECT] } });
          }
          if (url.pathname === `/v1/orgs/${EMPTY_ORG.organizationId}/projects`) {
            return Response.json({ ok: true, data: { projects: [] } });
          }
          if (
            url.pathname ===
            `/v1/orgs/${ORG.organizationId}/projects/${PROJECT.projectId}/environments`
          ) {
            return Response.json({ ok: true, data: { environments: ENVIRONMENTS } });
          }
          if (
            url.pathname ===
            `/v1/orgs/${ORG.organizationId}/projects/${BARE_PROJECT.projectId}/environments`
          ) {
            return Response.json({ ok: true, data: { environments: [] } });
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

// Inline-style ban: the nonce CSP allows no `style` attribute in server-rendered markup. The
// character class covers both quote styles so a single-quoted `style='...'` cannot slip past the
// double-quote-only original (INS-412 item 1). `\snew RegExp` per call would recompile; hoist it.
const INLINE_STYLE_ATTR = /<[a-z][^>]*\sstyle=["']/i;

// Self-test the ban regex before trusting it against real HTML: prove it flags both quote styles
// (the item-1 regression was that only double quotes were caught) and ignores a bare `styleX` word.
function assertInlineStyleBanRegex() {
  const mustFlag = [`<div style="color:red">`, `<div style='color:red'>`, `<span  style="x">`];
  const mustPass = [`<div class="style">`, `<div data-style="x">`, `<div>styled</div>`];
  for (const html of mustFlag) {
    if (!INLINE_STYLE_ATTR.test(html)) {
      throw new Error(`inline-style ban regex failed to flag: ${html}`);
    }
  }
  for (const html of mustPass) {
    if (INLINE_STYLE_ATTR.test(html)) {
      throw new Error(`inline-style ban regex wrongly flagged: ${html}`);
    }
  }
  console.log("ok inline-style ban regex catches single- and double-quoted style attributes");
}

async function fetchPath(path, headers = {}) {
  return mf.dispatchFetch(`http://web.local${path}`, {
    headers: { accept: "text/html", ...headers },
    redirect: "manual",
  });
}

async function assertRouteHasMatchingCspNonce(
  path,
  { headers = {}, expect = [], authedDocument = false } = {},
) {
  const response = await fetchPath(path, headers);
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`);
  }

  // Authed console documents embed per-user org metadata and must never be cached (INS-410); public
  // SSR pages carry no such directive from this seam. Assert both directions on the real response.
  const cacheControl = response.headers.get("cache-control");
  if (authedDocument) {
    if (cacheControl !== "private, no-store") {
      throw new Error(
        `${path} authed console document must send Cache-Control: private, no-store, got ${cacheControl}`,
      );
    }
    if (response.headers.get("vary") !== "Cookie") {
      throw new Error(`${path} authed console document must send Vary: Cookie`);
    }
  } else {
    if (cacheControl?.includes("no-store")) {
      throw new Error(
        `${path} is a public SSR page but carries a no-store directive: ${cacheControl}`,
      );
    }
    if (response.headers.get("vary") === "Cookie") {
      throw new Error(`${path} is a public SSR page but carries Vary: Cookie`);
    }
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
  // The nonce CSP blocks style attributes entirely: server-rendered markup must not carry any,
  // whether double- or single-quoted.
  if (INLINE_STYLE_ATTR.test(html)) {
    throw new Error(`${path} server-rendered HTML carries an inline style attribute`);
  }
  for (const needle of expect) {
    if (!html.includes(needle)) {
      throw new Error(`${path} SSR HTML is missing expected content: ${needle}`);
    }
  }

  console.log(`ok ${path} nonce=${nonce}`);
}

/** Metadata-safe denial: a non-member or nonexistent resource must read as a 404, nothing more. */
async function assertNotFound(path, headers) {
  const response = await fetchPath(path, headers);
  if (response.status !== 404) {
    throw new Error(`${path} expected a metadata-safe 404, got ${response.status}`);
  }
  const html = await response.text();
  if (!html.includes("Not found")) {
    throw new Error(`${path} 404 page is missing its copy`);
  }
  console.log(`ok ${path} -> 404`);
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
  assertInlineStyleBanRegex();
  const authorization = { Authorization: `Bearer ${await mintSmokeCredential()}` };
  await assertRouteHasMatchingCspNonce("/");
  await assertRouteHasMatchingCspNonce("/login");
  await assertUnauthenticatedConsoleRedirect(`/orgs/${ORG.organizationId}`);
  await assertRouteHasMatchingCspNonce("/whoami", { headers: authorization, authedDocument: true });
  await assertRouteHasMatchingCspNonce(`/orgs/${ORG.organizationId}`, {
    headers: authorization,
    authedDocument: true,
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
    authedDocument: true,
    expect: [ORG.displayName, 'aria-label="Breadcrumb"'],
  });

  // Projects section (INS-370): authorized renders, protection badge, empty states, denials.
  await assertUnauthenticatedConsoleRedirect(
    `/orgs/${ORG.organizationId}/projects/${PROJECT.projectId}`,
  );
  await assertRouteHasMatchingCspNonce(`/orgs/${ORG.organizationId}/projects`, {
    headers: authorization,
    authedDocument: true,
    expect: [PROJECT.displayName, PROJECT.projectId, BARE_PROJECT.displayName, "2 projects"],
  });
  await assertRouteHasMatchingCspNonce(`/orgs/${EMPTY_ORG.organizationId}/projects`, {
    headers: authorization,
    authedDocument: true,
    expect: ["No projects yet", "insecur init"],
  });
  await assertRouteHasMatchingCspNonce(
    `/orgs/${ORG.organizationId}/projects/${PROJECT.projectId}`,
    {
      headers: authorization,
      authedDocument: true,
      expect: [
        PROJECT.displayName,
        PROJECT.projectId,
        ">Environments<",
        ">Secrets<",
        ">Access<",
        ">Delivery<",
        ">Protected<",
        ENVIRONMENTS[0].environmentId,
        ENVIRONMENTS[1].displayName,
      ],
    },
  );
  await assertRouteHasMatchingCspNonce(
    `/orgs/${ORG.organizationId}/projects/${BARE_PROJECT.projectId}`,
    {
      headers: authorization,
      authedDocument: true,
      expect: ["No environments yet", "insecur envs create"],
    },
  );
  // A project ID outside the member's org and an org outside the membership set are
  // indistinguishable from nonexistence.
  await assertNotFound(
    `/orgs/${ORG.organizationId}/projects/prj_01JZ8EDQ2R7V0X3Z6C9D1F4G5X`,
    authorization,
  );
  await assertNotFound(`/orgs/org_01JZ8E2QYQCCCCCCCCCCCCCCCC/projects`, authorization);
} finally {
  await mf.dispose();
}
