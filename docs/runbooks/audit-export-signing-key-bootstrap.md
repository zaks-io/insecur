# Runbook: Audit-Export Signing Key Bootstrap And Rotation (ADR-0045)

Concrete Security Runbook following the interface in
[../security-runbooks-and-release-gates.md](../security-runbooks-and-release-gates.md).
Implements the audit-export Ed25519 signing key ceremony required by
[ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md) and the shared instance-secret
lifecycle in [ADR-0028](../adr/0028-instance-secrets-in-secrets-store-with-escrow.md).

This runbook handles real signing-key material. It is **HITL, human-only**. No agent executes or
simulates it. The private key is never committed, logged, echoed into a transcript, or stored as a
`wrangler secret`.

Audit exports are **tamper-evident and independently verifiable** — not tamper-proof, not
immutable, and not non-repudiable against insecur. See
[ADR-0045](../adr/0045-asymmetric-signing-for-audit-exports-in-v1.md) and
[../research/legal-liability.md](../research/legal-liability.md) before publishing customer-facing
copy.

## purpose

Bring an Instance's audit-export Ed25519 signing key into existence safely: generate it offline,
record a sealed escrow copy **before** it becomes unreadable, load it into Cloudflare Secrets Store
for the Runtime Worker, and publish the corresponding public key so `insecur audit verify` and
external auditors can verify exports without a shared secret.

## when_to_use

- **Triggers:** standing up a new Instance that will sign audit exports in production; rotating an
  existing audit-export signing key; re-publishing public keys after rotation.
- **Non-triggers:** rotating the instance root key (use the Root Key Rotation runbook); generating
  the audit-export HMAC key (same custody shape but a separate Secrets Store secret —
  `AUDIT_EXPORT_HMAC_KEY_V1`).

## scope

One Instance, one environment. The Runtime Worker declares a single Secrets Store binding,
`AUDIT_EXPORT_SIGNING_KEY_V1`, whose JSON value carries the **current** signing key material and an
internal `keyVersion` field that drives manifest `signing_key_version`. Rotation updates that same
binding (new key material + bumped `keyVersion`), not additional per-version bindings. Public keys
for **current and historical** versions are published at
`/.well-known/insecur/audit-export-signing-keys.json` on the Public Site Worker.

## required_authority

- Offline generation: physical control of a trusted machine.
- Escrow: write access to the operator's external password manager vault (1Password).
- Cloudflare load + bind: Cloudflare account role **Super Administrator** or **Secrets Store
  Deployer/Admin** (ADR-0028).
- Public-key publication: permission to set the per-environment GitHub Environment var
  (`PRODUCTION_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY` /
  `PREVIEW_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY`) and deploy the Public Site Worker.

## preconditions

- The escrow target is **external to insecur** (a 1Password vault item).
- `apps/runtime/wrangler.jsonc` declares the single Secrets Store binding
  `AUDIT_EXPORT_SIGNING_KEY_V1`. Bindings live **only** on the private Runtime Worker
  (`insecur-runtime`); the public API Worker must never declare them (ADR-0077; enforced by
  `pnpm conformance:topology`).
- The generating machine is trusted and can be taken offline during generation.
- Escrow exists **before** the first production export is signed. Losing a key version without
  escrow breaks verifiability of exports signed under that version.

## safe_inputs

The only Sensitive Value in this runbook is the Ed25519 private key (PKCS#8, base64url). It enters
in exactly three places and nowhere else:

1. The offline generation command's stdout (transient, on the trusted machine).
2. The 1Password vault item (sealed escrow copy).
3. The Cloudflare Secrets Store value field (write-only after creation), as JSON:

```json
{
  "keyVersion": 1,
  "privateKeyPkcs8Base64Url": "<pkcs8-base64url>",
  "publicKeyRawBase64Url": "<raw-ed25519-public-key-base64url>"
}
```

It must never enter: a shell history file, a committed file, a `wrangler secret`, a `.env`, a log,
an agent transcript, the published public-key document, or any insecur-controlled store other than
Secrets Store.

## dry_run

Preview without producing key material:

- Confirm `apps/runtime/wrangler.jsonc` already declares `AUDIT_EXPORT_SIGNING_KEY_V1` with a
  placeholder `secret_name` (no private key material in git).
- Confirm the Public Site route assembles the published document with
  `claim_ceiling: "tamper-evident, independently verifiable"` and injects the public key from the
  per-environment `AUDIT_EXPORT_SIGNING_PUBLIC_KEY` var (`apps/site/src/static-site-routes.ts`).
- Run `pnpm build` so the Worker dry-run deploy passes before adding live secret material.

## execute

Order is load-bearing: **generate → escrow → load → publish**. Escrow comes before the Cloudflare
load because Secrets Store is write-only after creation.

### Bootstrap (version 1)

1. **Go offline** on the trusted machine for generation and escrow.

2. **Generate** an Ed25519 key pair offline. Example using Node 24 WebCrypto:

```bash
node -e "
const { webcrypto } = require('crypto');
(async () => {
  const kp = await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const spki = new Uint8Array(await webcrypto.subtle.exportKey('spki', kp.publicKey));
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', kp.privateKey));
  const b64url = (buf) => Buffer.from(buf).toString('base64url');
  const material = {
    keyVersion: 1,
    privateKeyPkcs8Base64Url: b64url(pkcs8),
    publicKeyRawBase64Url: b64url(spki.slice(-32)),
  };
  process.stdout.write(JSON.stringify(material));
})();
"
```

3. **Escrow first.** Store the full JSON material in a 1Password vault item. Record metadata:
   instance ID, signing key version, created date, environment, and a note that this is the
   authoritative offline escrow copy. The 1Password access log is the out-of-band access record.

4. **Load into Cloudflare Secrets Store.** Create the secret for the target Instance environment
   and paste the same JSON value. After creation it is write-only.

5. **Publish the public key.** Set the per-environment GitHub Environment var to the raw base64url
   public key (never the private key):

   - Production: `PRODUCTION_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY`
   - Preview: `PREVIEW_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY`

   The deploy workflow injects it into the Public Site Worker's `AUDIT_EXPORT_SIGNING_PUBLIC_KEY`
   var (`scripts/wrangler-deploy-config.mjs`). The Site route
   (`apps/site/src/static-site-routes.ts`) assembles the published document at request time from the
   constant schema fields plus that injected key, serving:

```json
{
  "schema_version": "1",
  "algorithm": "Ed25519",
  "current_version": 1,
  "claim_ceiling": "tamper-evident, independently verifiable",
  "keys": [
    {
      "version": 1,
      "public_key_base64url": "<raw-ed25519-public-key-base64url>",
      "custody_evidence_ref": null
    }
  ]
}
```

Deploy the Public Site Worker so the new var takes effect. Only the non-secret public key belongs
in the GitHub Environment var. `custody_evidence_ref` is currently `null` until an escrow
reference is recorded (follow-up).

6. **Clear the terminal** so the private key is not left in scrollback.

### Rotation (version n → n+1)

1. Generate a new Ed25519 key pair offline using the same ceremony as bootstrap, but set
   `keyVersion` to `n+1` in the JSON material.
2. Escrow the new material in 1Password before loading it anywhere live.
3. **Replace** the existing `AUDIT_EXPORT_SIGNING_KEY_V1` Secrets Store value with the new JSON
   (new private/public key fields **and** `keyVersion: n+1`). Do not add a new binding — the
   binding name stays `_V1`; the internal `keyVersion` is what advances.
4. Re-publish the document for `n+1`. The current V1 Site route publishes a single `current_version:
1` key from the injected var. Multi-version rotation (adding the new public key with
   `active_since`, keeping the retired key with `retired_at` so old exports stay verifiable) requires
   extending the Site route to assemble the historical key list; the published-keys parser already
   supports it. **Keep retired public keys** in the published document.
5. Deploy Runtime (signing) then Site (publication). Subsequent manifests record
   `signing_key_version: n+1`. Omitting or failing to bump `keyVersion` in the Secrets Store JSON
   causes Runtime to fail closed at export time rather than silently reusing version `1`.

## verify

Verify against the **deployed** Instance, not localhost plaintext fallbacks:

- Export a tenant audit trail and run `insecur audit verify` with
  `--published-signing-keys https://<site>/.well-known/insecur/audit-export-signing-keys.json`
  (or a local copy of the published document). Signature, hash chain, and manifest HMAC must pass.
  Do not also set `INSECUR_AUDIT_EXPORT_SIGNING_PUBLIC_KEY` when using the published document —
  the env override runs after published keys and overwrites the manifest's `signing_key_version`.
- Confirm production refuses to sign when Secrets Store bindings are absent
  (`AuditExportKeysNotConfiguredError`; no env fallback in production — ADR-0064 posture).
- Tamper with the export signature only; `audit verify` must fail with
  `audit.export.signature_invalid` while the hash chain remains valid.
- After rotation, verify an export signed under the retired version against the historical public
  key still listed in the published document.
- Confirm no private key material appears in `git log`, `wrangler` output, CI logs, or runbook
  execution notes.

## expected_audit

Operational evidence is metadata-only:

- 1Password item creation timestamp + access log entry (escrow evidence).
- Cloudflare Secrets Store secret creation event in the account audit log.
- GitHub Environment var change for `*_SITE_AUDIT_EXPORT_SIGNING_PUBLIC_KEY` (public key only) plus
  the Public Site deploy run that injected it.
- A successful `insecur audit verify` run referencing the published document and manifest
  `signing_key_version`.

## recovery

- **Generation interrupted before escrow:** discard the key and regenerate.
- **Loaded to Cloudflare but escrow failed:** treat as a failed ceremony — generate a fresh key and
  restart; do not try to read the value back from Secrets Store.
- **Suspected private-key exposure:** treat as custody-material compromise; escalate to
  [custody-material-compromise.md](custody-material-compromise.md).
- **Lost Cloudflare store / account:** restore from the 1Password escrow copy by loading it into a
  fresh Secrets Store secret. Retired public keys must remain published for historical export
  verification.

## customer_communication

Use **tamper-evident, independently verifiable** when describing audit exports. Never use
tamper-proof, immutable, or non-repudiable. Rotation that only adds a new signing version does not
require tenant notification on its own; custody compromise does.

## evidence

Attach to the Security Evidence Bundle (`audit.*` / `backup_restore.*` control groups), all
metadata-only:

- Escrow record reference (1Password item ID + created timestamp).
- Signing key version.
- Cloudflare Secrets Store secret creation event ID.
- Published public-key document commit SHA and URL.
- `insecur audit verify` result for a sample export (status + `signing_key_version` only).
- Production fail-closed confirmation when bindings are absent.
