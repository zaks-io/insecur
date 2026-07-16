import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const RENDERER = new URL("./render-restore-coordinator.mjs", import.meta.url);
const TOKEN = "test-coordinator-token";

async function renderedWorker() {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "restore-coordinator-"));
  execFileSync(process.execPath, [RENDERER.pathname, "--out-dir", outDir, "--env", "preview"]);
  const worker = (await import(pathToFileURL(path.join(outDir, "worker.js")).href)).default;
  return { worker, outDir };
}

function coordinatorEnv(restoreImport) {
  return { RESTORE_COORDINATOR_TOKEN: TOKEN, RUNTIME_RESTORE: { restoreImport } };
}

function restoreRequest(body) {
  return new Request("https://coordinator.test/restore-import", {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}` },
    body,
  });
}

test("restore coordinator returns structured envelopes (INS-612)", async (t) => {
  const { worker, outDir } = await renderedWorker();
  t.after(() => rm(outDir, { recursive: true, force: true }));

  await t.test("a JSON null body gets a 400 validation envelope, not a 500", async () => {
    const response = await worker.fetch(restoreRequest("null"), coordinatorEnv());
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: { code: "validation.invalid_command_input" },
    });
  });

  await t.test("non-object JSON bodies get the same 400 envelope", async () => {
    for (const body of ["[]", '"text"', "42", "not json"]) {
      const response = await worker.fetch(restoreRequest(body), coordinatorEnv());
      assert.equal(response.status, 400, `body ${body} must be rejected with 400`);
      assert.deepEqual(await response.json(), {
        ok: false,
        error: { code: "validation.invalid_command_input" },
      });
    }
  });

  await t.test("a rejected restoreImport RPC gets a metadata-only 409 envelope", async () => {
    const response = await worker.fetch(
      restoreRequest("{}"),
      coordinatorEnv(() => Promise.reject(new Error("binding detail must not leak"))),
    );
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.deepEqual(payload, { ok: false, error: { code: "backup_restore.import_failed" } });
    assert.ok(!JSON.stringify(payload).includes("binding detail must not leak"));
  });

  await t.test("a refused import result still maps to 409 with the RPC envelope", async () => {
    const refused = {
      ok: false,
      error: { code: "backup_restore.not_armed", message: "restore target is not armed" },
    };
    const response = await worker.fetch(
      restoreRequest("{}"),
      coordinatorEnv(() => Promise.resolve(refused)),
    );
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), refused);
  });

  await t.test("a successful import returns 200 with the RPC result", async () => {
    const success = { ok: true, value: { imported: true } };
    let receivedInput;
    const response = await worker.fetch(
      restoreRequest(
        JSON.stringify({
          artifactRef: "backup/exports/x/artifact.ibkp",
          expectedInstanceId: "inst_test",
          expectedRootKeyVersion: 1,
        }),
      ),
      coordinatorEnv((input) => {
        receivedInput = input;
        return Promise.resolve(success);
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), success);
    assert.deepEqual(receivedInput, {
      artifactRef: "backup/exports/x/artifact.ibkp",
      expectedInstanceId: "inst_test",
      expectedRootKeyVersion: 1,
    });
  });

  await t.test("a missing or wrong bearer token stays a 401 before any parsing", async () => {
    const response = await worker.fetch(
      new Request("https://coordinator.test/restore-import", { method: "POST", body: "null" }),
      coordinatorEnv(),
    );
    assert.equal(response.status, 401);
  });
});
