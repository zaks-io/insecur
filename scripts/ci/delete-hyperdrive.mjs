#!/usr/bin/env node
// Delete a per-PR Hyperdrive config BY EXACT NAME. This is the safe teardown path:
// it resolves `insecur-db-pr-N` by name and deletes only that id. It never selects a
// Hyperdrive by position, so it cannot delete a shared/production config (the landmine
// that the old `wrangler hyperdrive list | grep | head -1` cleanup carried).
import { findHyperdriveByName, run, stringOption } from "./lib/hyperdrive.mjs";

const name = stringOption(process.argv.slice(2), "--name");
if (!name) {
  throw new Error("Set --name (the exact insecur-db-pr-N config name).");
}

const existing = await findHyperdriveByName(name);
if (!existing) {
  process.stdout.write(`No Hyperdrive named ${name}; nothing to delete.\n`);
  process.exit(0);
}

await run("pnpm", ["exec", "wrangler", "hyperdrive", "delete", existing.id]);
process.stdout.write(`Deleted Hyperdrive ${name} (${existing.id}).\n`);
