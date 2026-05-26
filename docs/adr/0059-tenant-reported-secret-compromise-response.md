# ADR-0059: Tenant-Reported Secret Compromise Response

Date: 2026-05-25

Status: Accepted

## Decision

A tenant report of "my secret leaked" is handled by one entry runbook that triages, then routes. The runbook is scoped to a tenant's own stored Secret value. insecur custody-material compromise (root key, Provider Credentials, the Cloudflare account) is a separate runbook the triage hands off to, together with the ADR-0048 forensic record. One entry door, two response surfaces, because the two responses differ in authority, forensic sources, and customer-communication posture.

### Triage and escalation

Every report defaults to tenant-side rotation. Escalation to the custody-material compromise runbook and ADR-0048 forensic collection is triggered by any one of a named signal set:

1. Correlated compromise reports from unrelated tenants in a short window.
2. A leaked value that matches Sensitive Metadata or a Secret value insecur holds that the tenant says it never exposed, which points at the delivery boundary or insecur custody rather than tenant-side handling.
3. Decrypt or access events in the product audit log with no matching authorized operation.
4. A Cloudflare or Secrets Store log anomaly, or escrow access with no matching authorized operation. This is the only place root-key extraction is visible (ADR-0048); the product audit log cannot see it.

Tenant self-classification does not drive routing. Tenants cannot observe insecur's custody layer, so the one report that signals an insecur-side breach would be misrouted to routine rotation.

### Two-column containment

For a confirmed tenant-value compromise the runbook divides the work explicitly and states the boundary plainly:

- **insecur-side (delivery containment).** Publish a new value, not a rollback, because the prior Published Version may also be exposed. Re-sync to overwrite provider-side copies through Inline Sync Execution (ADR-0057). Invalidate non-expired Injection Grants that reference the old version. Enumerate the full reach of the old value from audit metadata: Environments, Secret Syncs and their targets, Runtime Injection Policies, issued grants, and delivered version IDs.
- **tenant-side (the runbook surfaces this prominently and insecur cannot execute it).** Revoke the leaked credential at its upstream issuer (AWS, the database, the API provider) and confirm. insecur is the Source of Truth for which value is delivered, not the issuer of the credential. Delivery-side rotation does not invalidate the leaked credential upstream.

### Leak Verification is deferred

Signal 2 is a manual judgment in V1. A built Leak Verification primitive, which would confirm whether a candidate leaked string matches a managed Secret without revealing it, is deferred. When built it must compute on demand and store nothing: the client hashes the candidate locally and sends only the digest; the server decrypts each candidate Secret in an approved execution path (Secret Use, never a Reveal), hashes it transiently, constant-time compares, and returns matched opaque Secret IDs or no-match. It must not persist a hash index of Secret values. Against Protected Environment no-reveal Secrets a match is a partial confirmation oracle, so that path requires full-value-only matching (no prefix or substring), hard rate limits, full audit, and step-up under incident context (ADR-0016).

## Options Considered

- **One combined incident runbook** covering tenant-value and custody-material compromise. Rejected. It conflates two responses with different authority, forensic sources, and customer-communication posture into one document that ages badly.
- **Tenant self-classification routing.** Rejected. Tenants cannot observe insecur's custody layer; an insecur-side breach reported as a routine leak would be mis-triaged to rotation.
- **Forensic-first on every report.** Rejected. Running ADR-0048 collection on every routine tenant leak is slow, noisy, and trains responders to ignore the alarm.
- **Stored hash index for Leak Verification** (precomputed SHA-256 or keyed HMAC of each Secret value). Rejected for V1 and as the eventual design. It is a second persistent representation of secret material, a standing confirmation oracle if it leaks, and it must be crypto-erased and key-rotated in lockstep with the ciphertext, all for little gain over transient decrypt-and-compare.
- **Triage door, tenant-side default, two-column containment, custody-material and Leak Verification handled separately.** Accepted. Cheap default, explicit escalation tripwires, an honest containment boundary, and no new persistent secret representation.

## Consequences

- The "tenant reports a compromised secret" runbook is a triage-and-route entry point in the Runbook Catalog, distinct from the custody-material compromise and ADR-0048 forensic runbooks it escalates to.
- The product makes an honest containment claim. It contains delivery-side and tells the tenant exactly what it cannot do. A leaked credential staying valid at its issuer after insecur rotation is stated, not hidden.
- Escalation is signal-driven, so routine tenant leaks stay cheap while the breach-canary report still trips the forensic path.
- Reach enumeration depends only on existing audit metadata (grant audit delivered version IDs, sync target metadata); it adds no new storage.
- Leak Verification stays add-back-ready as a metadata-only, decrypt-on-demand operation. The stored-hash design is foreclosed here so a future builder does not reintroduce the oracle.
- V1 stores no hash or other second representation of Secret values for leak detection.
