import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const expectedDigest = process.argv[2];
const variableKey = process.argv[3] ?? "INSECUR_PROOF_SECRET";
const value = process.env[variableKey];

function fail(reason) {
  console.error(JSON.stringify({ ok: false, checked: variableKey, reason }));
  process.exit(1);
}

if (typeof expectedDigest !== "string" || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
  fail("invalid_expected_digest");
}

if (typeof value !== "string" || value.length < 32) {
  fail("missing_or_too_short");
}

if (process.env.INSECUR_SESSION_TOKEN !== undefined) {
  fail("session_token_leaked");
}

const actualDigest = createHash("sha256").update(value, "utf8").digest();
const expectedDigestBytes = Buffer.from(expectedDigest, "hex");

if (
  actualDigest.length !== expectedDigestBytes.length ||
  !timingSafeEqual(actualDigest, expectedDigestBytes)
) {
  fail("digest_mismatch");
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
