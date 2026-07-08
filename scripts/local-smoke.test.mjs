import assert from "node:assert/strict";
import test from "node:test";

import { localSmokeCommands, parseArgs, runLocalSmoke } from "./local-smoke.mjs";

test("parses local smoke options", () => {
  assert.deepEqual(parseArgs([]), { withDocker: false });
  assert.deepEqual(parseArgs(["--with-docker"]), { withDocker: true });
  assert.deepEqual(parseArgs(["--", "--with-docker"]), { withDocker: true });
  assert.throws(() => parseArgs(["--unknown"]), /Unknown option: --unknown/u);
});

test("runs smoke against a configured database service by default", () => {
  assert.deepEqual(localSmokeCommands({ withDocker: false }), [
    ["pnpm", ["dev:db:reset-service"]],
    ["node", ["scripts/ci/postgres-integration-tests.mjs"]],
  ]);
});

test("can reset Docker Compose Postgres before smoke tests", () => {
  assert.deepEqual(localSmokeCommands({ withDocker: true }), [
    ["pnpm", ["dev:db:reset"]],
    ["node", ["scripts/ci/postgres-integration-tests.mjs"]],
  ]);
});

test("runs commands in order", () => {
  const calls = [];
  runLocalSmoke({ withDocker: true }, (command, args) => {
    calls.push([command, args]);
  });

  assert.deepEqual(calls, [
    ["pnpm", ["dev:db:reset"]],
    ["node", ["scripts/ci/postgres-integration-tests.mjs"]],
  ]);
});
