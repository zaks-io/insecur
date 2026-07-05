import { unstable_dev } from "wrangler";

const FAKE_ENV = {
  WORKOS_API_KEY: "sk_test_fake",
  WORKOS_CLIENT_ID: "client_fake",
  WORKOS_COOKIE_PASSWORD: "a".repeat(32),
  SESSION_SIGNING_SECRET: "b".repeat(32),
  TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
  INSTANCE_ID: "inst_LOCAL_DEV",
  API: {
    fetch: async () =>
      new Response(JSON.stringify({ ok: false, error: { code: "unauthenticated" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
  },
  RUNTIME: {
    resolveAdmission: async () => null,
    recordAdmissionDenied: async () => undefined,
  },
};

async function assertRouteHasMatchingCspNonce(worker, path) {
  const response = await worker.fetch(`http://localhost${path}`, {
    headers: { accept: "text/html" },
  });
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

  console.log(`ok ${path} nonce=${nonce}`);
}

const worker = await unstable_dev("dist/server/index.js", {
  local: true,
  config: "wrangler.jsonc",
  experimental: { disableExperimentalWarning: true },
  bindings: FAKE_ENV,
});

try {
  await assertRouteHasMatchingCspNonce(worker, "/");
  await assertRouteHasMatchingCspNonce(worker, "/whoami");
} finally {
  await worker.stop();
}
