import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const expectedValuePath = process.argv[2];
const variableKey = process.argv[3] ?? "INSECUR_PROOF_SECRET";
const value = process.env[variableKey];

function fail(reason) {
  console.error(JSON.stringify({ ok: false, checked: variableKey, reason }));
  process.exit(1);
}

if (typeof expectedValuePath !== "string" || expectedValuePath.length === 0) {
  fail("invalid_expected_value_path");
}

if (typeof value !== "string" || value.length < 32) {
  fail("missing_or_too_short");
}

if (process.env.INSECUR_SESSION_TOKEN !== undefined) {
  fail("session_token_leaked");
}

let expectedValue;
try {
  expectedValue = readFileSync(expectedValuePath, "utf8");
} catch {
  fail("expected_value_unreadable");
}

const actualValueBytes = Buffer.from(value, "utf8");
const expectedValueBytes = Buffer.from(expectedValue, "utf8");

if (
  actualValueBytes.length !== expectedValueBytes.length ||
  !timingSafeEqual(actualValueBytes, expectedValueBytes)
) {
  fail("value_mismatch");
}

const proof = createHmac("sha256", value).update("insecur:local-cli-proof:v1").digest("hex");

console.log(
  JSON.stringify({
    ok: true,
    checked: variableKey,
    proof: "digest-and-hmac",
    valueLength: value.length,
    proofLength: proof.length,
  }),
);
