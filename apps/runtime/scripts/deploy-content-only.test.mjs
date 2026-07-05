import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePublicDeployVarBindings,
  pickDesiredPublicDeployVars,
} from "./deploy-content-only-public-vars.mjs";
import { runContentOnlyDeploy } from "./deploy-content-only-lib.mjs";

test("pickDesiredPublicDeployVars keeps only public plain-text deploy vars", () => {
  assert.deepEqual(
    pickDesiredPublicDeployVars({
      SENTRY_RELEASE: "abc123",
      SENTRY_SERVICE: "insecur-runtime",
      INSTANCE_ID: "should-not-copy",
    }),
    {
      SENTRY_RELEASE: "abc123",
      SENTRY_SERVICE: "insecur-runtime",
    },
  );
});

test("mergePublicDeployVarBindings updates release vars without touching custody bindings", () => {
  const bindings = [
    { name: "SENTRY_RELEASE", type: "plain_text", text: "old-sha" },
    {
      name: "INSTANCE_ROOT_KEY_V1",
      type: "secrets_store_secret",
      store_id: "store-1",
      secret_name: "root-key",
    },
    { name: "DB", type: "hyperdrive", id: "hyperdrive-1" },
    { name: "RUNTIME_TOKEN_SIGNING_SECRET", type: "secret_text" },
  ];

  const merged = mergePublicDeployVarBindings(bindings, { SENTRY_RELEASE: "new-sha" });

  assert.equal(merged[0].text, "new-sha");
  assert.deepEqual(merged[1], bindings[1]);
  assert.deepEqual(merged[2], bindings[2]);
  assert.deepEqual(merged[3], bindings[3]);
});

test("runContentOnlyDeploy patches public deploy vars after uploading content", async () => {
  const calls = [];
  const settingsBindings = [
    { name: "SENTRY_RELEASE", type: "plain_text", text: "old-sha" },
    {
      name: "INSTANCE_ROOT_KEY_V1",
      type: "secrets_store_secret",
      store_id: "00000000000000000000000000000001",
      secret_name: "INSECUR_PUBLIC_PRODUCTION_ROOT_KEY_PLACEHOLDER_V1",
    },
    {
      name: "DB",
      type: "hyperdrive",
      id: "00000000000000000000000000000002",
    },
    { name: "RUNTIME_TOKEN_SIGNING_SECRET", type: "secret_text" },
  ];

  await runContentOnlyDeploy({
    env: {
      CLOUDFLARE_ACCOUNT_ID: "account-id",
      CLOUDFLARE_API_TOKEN: "api-token",
      INSECUR_RUNTIME_ROOT_KEY_STORE_ID: "00000000000000000000000000000001",
      INSECUR_RUNTIME_ROOT_KEY_SECRET_NAME: "INSECUR_PUBLIC_PRODUCTION_ROOT_KEY_PLACEHOLDER_V1",
      INSECUR_RUNTIME_HYPERDRIVE_ID: "00000000000000000000000000000002",
      SENTRY_RELEASE: "new-sha",
    },
    readFileFn: async (filePath) => {
      if (filePath.endsWith("index.js")) {
        return Buffer.from("export default {};");
      }
      return Buffer.from("{}");
    },
    fetchFn: async (url, init = {}) => {
      calls.push({ url, method: init.method ?? "GET" });

      if (url.endsWith("/settings") && init.method === "GET") {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              compatibility_date: "2026-05-27",
              compatibility_flags: ["nodejs_compat"],
              observability: {
                enabled: true,
                logs: { enabled: true, destinations: ["axiom-logs"] },
                traces: { enabled: true, destinations: ["axiom-traces"] },
              },
              bindings: settingsBindings,
            },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith("/settings") && init.method === "PATCH") {
        const body = init.body;
        assert.ok(body instanceof FormData);
        const settingsBlob = body.get("settings");
        const settings = JSON.parse(await settingsBlob.text());
        assert.equal(settings.bindings[0].text, "new-sha");
        assert.equal(settings.bindings[1].type, "secrets_store_secret");
        assert.equal(settings.bindings[2].type, "hyperdrive");
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }

      if (url.endsWith("/content") && init.method === "PUT") {
        return new Response(JSON.stringify({ success: true, result: {} }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${init.method ?? "GET"} ${url}`);
    },
  });

  assert.ok(calls.some((call) => call.method === "PUT" && call.url.endsWith("/content")));
  assert.ok(calls.some((call) => call.method === "PATCH" && call.url.endsWith("/settings")));
});
