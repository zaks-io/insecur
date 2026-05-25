# First Value Proof

This is the copyable non-protected development example for the first insecur session.

It uses the real product flow:

```bash
insecur secrets set --secret-name INSECUR_PROOF_SECRET --generate random --length 32 --comment "First value proof"
insecur run --secret-name INSECUR_PROOF_SECRET -- node examples/first-value-proof/verify.mjs
```

The verifier expects `INSECUR_PROOF_SECRET` in its environment, uses it as an HMAC key for an internal challenge, and prints only success or failure. It does not print the secret, the child-process environment, or a digest.

You can smoke-test the example script without insecur:

```bash
INSECUR_PROOF_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')" node examples/first-value-proof/verify.mjs
```

Expected output:

```json
{"ok":true,"checked":"INSECUR_PROOF_SECRET","proof":"hmac-challenge"}
```
