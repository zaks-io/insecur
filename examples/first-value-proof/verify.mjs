import { createHmac, timingSafeEqual } from "node:crypto";

const variableKeyIndex = process.argv.indexOf("--variable-key");
const variableName =
  variableKeyIndex === -1 ? "INSECUR_PROOF_SECRET" : process.argv[variableKeyIndex + 1];
if (typeof variableName !== "string" || variableName === "") {
  console.error(JSON.stringify({ ok: false, reason: "missing_variable_key" }));
  process.exit(1);
}
const value = process.env[variableName];

function fail(reason) {
  console.error(JSON.stringify({ ok: false, checked: variableName, reason }));
  process.exit(1);
}

if (typeof value !== "string" || value.length < 32) {
  fail("missing_or_too_short");
}

const challenge = "insecur:first-value-proof:v1";
const mac = createHmac("sha256", value).update(challenge).digest();
const expected = createHmac("sha256", value).update(challenge).digest();

if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
  fail("verification_failed");
}

console.log(
  JSON.stringify({
    ok: true,
    checked: variableName,
    proof: "hmac-challenge",
  }),
);
