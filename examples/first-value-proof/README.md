# First Value Proof

This is the copyable non-protected development example for the first insecur session.

It uses the real product flow:

```bash
eval "$(insecur login --print-export)"
insecur init
insecur secrets set --variable-key INSECUR_PROOF_SECRET --generate random --length 32
insecur run --variable-key INSECUR_PROOF_SECRET -- node examples/first-value-proof/verify.mjs
```

Before the secret commands, authenticate once with `insecur login --print-export` and `eval` its
stdout so the exchanged session credential lives only in the current shell environment. Later
commands in that shell can run as separate processes via `INSECUR_SESSION_TOKEN`. Alternatives:

- set `INSECUR_SESSION_TOKEN` explicitly for one-shot automation, or
- run follow-on commands inside `insecur shell <profile-slug-or-id>` so the token lives only in that
  subshell environment.

`insecur logout` clears the in-process session only. Login JSON output stays metadata-only and never
prints the credential unless `--print-export` is used for intentional shell handoff.

The verifier expects `INSECUR_PROOF_SECRET` in its environment, uses it as an HMAC key for an internal challenge, and prints only success or failure. It does not print the secret, the child-process environment, or a digest.

You can smoke-test the example script without insecur:

```bash
INSECUR_PROOF_SECRET="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64url"))')" node examples/first-value-proof/verify.mjs
```

Expected output:

```json
{ "ok": true, "checked": "INSECUR_PROOF_SECRET", "proof": "hmac-challenge" }
```
