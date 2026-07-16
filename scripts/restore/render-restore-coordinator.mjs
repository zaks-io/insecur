#!/usr/bin/env node
// Renders the window-scoped restore coordinator Worker (ADR-0084, INS-565) into an
// operator-chosen directory OUTSIDE version control. The coordinator is the keyless operator
// invocation path for `RuntimeRestoreService`: it holds no root key, no Secrets Store binding,
// no Hyperdrive binding, and no decrypt API — a single Service Binding to `insecur-runtime`
// selecting the restore entrypoint, plus an operator bearer token gate (Worker secret, an access
// gate only, never key material). It is deployed for the restore window and torn down with it;
// the deploy-topology conformance gate fails any checked-in config declaring this binding, which
// is why this file renders the config instead of the repo committing one.

import { mkdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const RUNTIME_SERVICE_BY_ENV = {
  production: "insecur-runtime",
  preview: "insecur-runtime-preview",
};

function usage(message) {
  process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: node scripts/restore/render-restore-coordinator.mjs --out-dir <dir-outside-repo> [--env production|preview]\n",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const args = { env: "production" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--out-dir") {
      args.outDir = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--env") {
      args.env = argv[index + 1];
      index += 1;
    } else {
      usage(`unknown argument: ${argv[index]}`);
    }
  }
  if (!args.outDir) {
    usage("--out-dir is required (choose a directory outside the repository)");
  }
  if (!(args.env in RUNTIME_SERVICE_BY_ENV)) {
    usage(`--env must be one of: ${Object.keys(RUNTIME_SERVICE_BY_ENV).join(", ")}`);
  }
  return args;
}

const WORKER_SOURCE = `// Window-scoped restore coordinator (ADR-0084). Keyless: relays operator restore
// parameters to RuntimeRestoreService over the private Service Binding and returns
// metadata-only results. Deployed for the restore window only; torn down with it.
function timingSafeEqual(left, right) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < leftBytes.byteLength; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

export default {
  async fetch(request, env) {
    const authorization = request.headers.get("authorization") ?? "";
    const expected = \`Bearer \${env.RESTORE_COORDINATOR_TOKEN ?? ""}\`;
    if (!env.RESTORE_COORDINATOR_TOKEN || !timingSafeEqual(authorization, expected)) {
      return new Response("unauthorized", { status: 401 });
    }
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/restore-import") {
      return new Response("not found", { status: 404 });
    }
    const invalidInput = () =>
      new Response(JSON.stringify({ ok: false, error: { code: "validation.invalid_command_input" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    let input;
    try {
      input = await request.json();
    } catch {
      return invalidInput();
    }
    // JSON.parse accepts \`null\` and other non-object bodies; reading fields off those would
    // throw and surface as an opaque 500 instead of a structured envelope.
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return invalidInput();
    }
    let result;
    try {
      result = await env.RUNTIME_RESTORE.restoreImport({
        artifactRef: String(input.artifactRef ?? ""),
        expectedInstanceId: String(input.expectedInstanceId ?? ""),
        expectedRootKeyVersion: Number(input.expectedRootKeyVersion ?? 0),
      });
    } catch {
      // A rejected RPC (binding unavailable, serialization failure) must stay metadata-only:
      // a fixed reason code, never the thrown error's message or stack.
      result = { ok: false, error: { code: "backup_restore.import_failed" } };
    }
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 409,
      headers: { "content-type": "application/json" },
    });
  },
};
`;

function wranglerConfig(envName) {
  return `${JSON.stringify(
    {
      $schema: "https://unpkg.com/wrangler/config-schema.json",
      name: `insecur-restore-coordinator-${envName}`,
      main: "worker.js",
      compatibility_date: "2026-05-27",
      // ADR-0084 anchors the coordinator on Cloudflare account access, not a public URL. Keep the
      // workers.dev route OFF: the operator binds their own trigger path (a Cloudflare Access -
      // gated route or a local `wrangler dev` tunnel) so the token is defense-in-depth, not the
      // sole gate. The renderer never ships a public URL.
      workers_dev: false,
      services: [
        {
          binding: "RUNTIME_RESTORE",
          service: RUNTIME_SERVICE_BY_ENV[envName],
          entrypoint: "RuntimeRestoreService",
        },
      ],
    },
    null,
    2,
  )}\n`;
}

const args = parseArgs(process.argv.slice(2));
const outDir = isAbsolute(args.outDir) ? args.outDir : resolve(process.cwd(), args.outDir);
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "worker.js"), WORKER_SOURCE);
writeFileSync(join(outDir, "wrangler.jsonc"), wranglerConfig(args.env));

process.stdout.write(`rendered restore coordinator for ${args.env} into ${outDir}\n`);
process.stdout.write(`next (operator, restore window only — never commit these files):\n`);
process.stdout.write(`  1. cd ${outDir}\n`);
process.stdout.write(
  "  2. openssl rand -hex 32 | npx wrangler secret put RESTORE_COORDINATOR_TOKEN\n",
);
process.stdout.write(
  "  3. npx wrangler deploy  (workers.dev is off; bind a Cloudflare Access-gated route\n" +
    "     for the account-access anchor, or trigger over `npx wrangler dev` locally)\n",
);
process.stdout.write(
  '  4. curl -X POST "https://<your-access-gated-route>/restore-import" -H "Authorization: Bearer <token>" -d \'{"artifactRef":"...","expectedInstanceId":"...","expectedRootKeyVersion":1}\'\n',
);
process.stdout.write("  5. teardown with: npx wrangler delete (required before window close)\n");
