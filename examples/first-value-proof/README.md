# First Value Proof

This is the copyable non-protected development example for the first insecur session.

It uses the real product flow inside a managed authenticated shell:

```bash
insecur login --shell
```

Inside the managed shell (no profile required before `init`):

```bash
insecur init
insecur secrets set --variable-key INSECUR_PROOF_SECRET --generate random --length 32
insecur run --variable-key INSECUR_PROOF_SECRET -- node examples/first-value-proof/verify.mjs
```

`insecur login --shell` exchanges a WorkOS browser session and starts an interactive child shell
with `INSECUR_SESSION_TOKEN` in that child environment only. The CLI never prints the session
credential, writes it to disk, or asks you to `eval` or `source` shell exports.

The verifier expects `INSECUR_PROOF_SECRET` in its environment, uses it as an HMAC key for an internal challenge, and prints only success or failure. It does not print the secret, the child-process environment, or a digest.

You can smoke-test the example script without insecur:

```bash
INSECUR_PROOF_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')" node examples/first-value-proof/verify.mjs
```

Expected output:

```json
{ "ok": true, "checked": "INSECUR_PROOF_SECRET", "proof": "hmac-challenge" }
```
