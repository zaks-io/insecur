# ADR-0031: Keyring Below The Encryption Engine

Date: 2026-05-24

Status: Accepted

The key hierarchy lives in a keyring module below the encryption engine, not inside it. The engine asks the keyring for the key it needs to lock or unlock a value; the keyring resolves the chain from the root key through an Organization Data Key, a Project Data Key, and the per-record key. Two consumers walk this chain: the engine reads keys to lock and unlock values, and the rotation workflow rewraps keys to retire old material. One only reads, the other mutates. Folding the chain into the engine would force rotation either to reach inside the engine or to duplicate the walk, so the keyring is its own module that both call. Its foundation is already fixed: the root key is in Cloudflare Secrets Store (ADR-0028), the wrapped Organization and Project Data Keys are in Postgres through the Tenant-Scoped Store, and the per-record key is in the envelope (ADR-0026). During a root rotation window, each record carries the key version the keyring uses to select the right root.

Because a V1 Instance is one Worker and one shared Postgres database with Row-Level Security (ADR-0036, ADR-0037), the keyring's locks are the Sensitive Value boundary while the Tenant-Scoped Store bounds metadata rows. Two keyring invariants are therefore load-bearing rather than nice-to-have: the keyring never returns one organization's unlocked key to another organization's request, and its in-memory cache of unlocked keys is scoped per tenant so nothing leaks across tenants in the shared isolate. ADR-0064 adds the orthogonal time-and-placement bound on that cache: key material is reachable only for the span of the request that needs it, never as module-global state and never from `process.env` in production. The wall it provides is between tenants for values and against a metadata-store-only compromise, not against deploy or account access, which ADR-0028 already accepted can extract the root key.

Rotating any key in the chain is one operation: re-lock the item beneath it under the new parent, never opening it. The keyring exposes a single rewrap primitive, and rotation at any level is that primitive applied across the right set. Rotating a Project Data Key re-locks every per-record key under it, an Organization Data Key re-locks the project keys under it, and the root re-locks the organization keys, which is the ADR-0028 master case. ADR-0028's root rotation is therefore the top instance of one machinery, not a special path. Rewrap touches only the key envelope, the wrap layer of ADR-0026: it transiently unwraps the one-time key to move it under the new parent but never decrypts the Sensitive Value, whose ciphertext stays sealed under its per-record key throughout.

The keyring owns the per-item primitive and the resolution; ADR-0005's rotation workflow owns the orchestration around it, planning which set to rewrap, executing, resuming after interruption, verifying, and auditing. Verify reduces to confirming no record still references the retired key version, a plain query over the key version each envelope already stores (ADR-0026). The Storage Security Gate (ADR-0005, ADR-0016) consumes a readiness check the keyring exposes, root reachable and data keys and versions present, rather than re-deriving crypto state itself.

## Consequences

The keyring's depth is that it concentrates key-chain resolution, the tenant-scoped cache of unlocked keys, root-version selection during a rotation window, and the single rewrap primitive behind one boundary, so the engine holds no hierarchy knowledge and no wrapper ever holds a key. No cross-tenant key handoff, rewrap never decrypting the value, and gate readiness are each a unit test against fakes for Secrets Store and the Tenant-Scoped Store.

Because the keyring is the Sensitive Value boundary, a cross-tenant key-handoff bug is a tenant-isolation breach, not a narrow crypto defect, so the cross-tenant authorization regression tests extend to the keyring alongside the Tenant-Scoped Store.

One uniform primitive means rotation correctness is established once. Re-introducing per-level rotation paths would re-open "never open the value" separately at each level.

The remaining root-rotation detail, whether the root layer uses a versioned named secret or a dual-named window, stays the open infra question recorded for ADR-0028. The keyring consumes whichever the root layer presents, through the per-record key version.

## Amendment (2026-06-11): Flat wrap topology under the root key

The 2026-06-03 amendments to ADR-0005 and ADR-0028 decide a flat wrap topology: Organization Data Keys and Project Data Keys are each independent random keys stored AES-GCM wrapped directly under the instance root key, not chained through one another. Two sentences in the record above predate that decision and are corrected here. The single-rewrap-primitive framing stands; only the per-level "right set" definitions change.

First, the resolution sentence ("the keyring resolves the chain from the root key through an Organization Data Key, a Project Data Key, and the per-record key") describes a four-level chain. The keyring instead resolves one of two flat paths: root key → Organization Data Key → per-record DEK for organization-level records, and root key → Project Data Key → per-record DEK for project records.

Second, the rotation cascade ("an Organization Data Key re-locks the project keys under it, and the root re-locks the organization keys, which is the ADR-0028 master case") mis-cites ADR-0028, whose original record already rewrapped both the organization and project data keys under the root, so the chained reading was wrong even when this record was written. The corrected per-level sets are: root rotation rewraps both Organization Data Keys and Project Data Keys per ADR-0028's amendment; rotating an Organization Data Key re-locks organization-level per-record DEKs (matching architecture.md's Key Rotation surfaces), not project keys; rotating a Project Data Key re-locks secret-version DEKs, unchanged.
