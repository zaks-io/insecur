import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const [expectedPath, expectedCwd] = process.argv.slice(2);
const actual = process.env.WORKTREE_SECRET;
const expected = readFileSync(expectedPath, "utf8");
const actualBytes = Buffer.from(actual ?? "", "utf8");
const expectedBytes = Buffer.from(expected, "utf8");
const sameValue =
  actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
const checks = {
  value: sameValue,
  cwd: process.cwd() === expectedCwd,
  unrelatedCredential: process.env.UNRELATED_WORKTREE_CREDENTIAL === undefined,
  session: process.env.INSECUR_SESSION_TOKEN === undefined,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, checks }));
if (!ok) process.exitCode = 1;
