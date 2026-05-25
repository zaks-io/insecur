# ADR-0026: Encryption Envelope Below Per-Domain Wrappers

Date: 2026-05-24

Status: Accepted

The encryption seam is one domain-agnostic envelope engine below thin per-domain wrappers for Secrets, Provider Credentials, and Sensitive Metadata. The engine concentrates the AES-GCM envelope (a per-record data encryption key wrapped under a tenant data key, the value encrypted under that data encryption key), key-version selection, identity binding, and the stored byte layout. Each wrapper owns only which Opaque Resource IDs identify its records; the engine never knows whether it is encrypting a Secret or a Provider Credential. This replaces the scaffold's `encryptSecret(plaintext, kekB64)`, which exposed a single global KEK, leaked the envelope shape to callers, and bound no identity at all.

The seam's egress is plaintext-free and key-free. The only plaintext that crosses the boundary outward is the output of decrypt, into an approved execution path; encrypt returns wrapped material only; and no data encryption key or other key material ever crosses the boundary in either direction. This is the crypto-side mirror of the plaintext-free version store (ADR-0025) and No Plaintext Persistence (ADR-0016): callers express intent as "encrypt this value for this record's identity" and "decrypt this record," and hold no key.

Ciphertext is bound to the identity of the record it belongs to, and that binding is recomputed from the record's own Opaque Resource IDs at decrypt rather than stored with the ciphertext. A record relocated or swapped to impersonate another fails authentication and does not decrypt. Storing the binding would defeat this, because an attacker who moved the row would move its stored binding with it; the protection depends on the binding coming from the record's trusted identity, not from attacker-reachable bytes. The engine owns one canonical, unambiguous serialization of the identity so wrappers cannot diverge on encoding; wrappers choose only the contents, order, and a record-type tag. Domain separation between Secrets, Provider Credentials, and Sensitive Metadata is that record-type tag under shared tenant data keys (ADR-0005), not separate keys per domain.

Identity binding and version binding live on different layers of the envelope, which is what reconciles this seam with ADR-0025. The ciphertext layer binds the immutable identity and no version of any kind, so ciphertext is portable across a Secret's content versions and Rollback is a no-decrypt copy. The DEK-wrap layer binds the data-key coordinate, which is the one field that is both stored and bound: stored because it selects the unwrap key and cannot be reconstructed from identity after rotation, bound so it cannot be swapped. The format marker is likewise stored and bound so it cannot be stripped to force a weaker interpretation. The Secret content version is tracked only in Postgres by the version store. Remaining stored fields, the nonces, the wrapped DEK, and the ciphertext, are mechanical.

## Consequences

The seam's depth is that it concentrates the key hierarchy, key-version selection, identity binding, canonical serialization, and envelope format behind an interface expressed in domain identity terms, so no caller holds a key or builds a binding by hand. The egress invariant, reconstruct-not-store binding, canonical identity, and domain-tag separation are each a unit test against a fake, and none is writable against the scaffold's keyless, binding-free `encryptSecret` (ADR-0018).

Reconstruct-not-store is load-bearing. Persisting the identity binding alongside the ciphertext would let a relocated row carry its own proof of belonging and silently decrypt in the wrong place, which is the swap this seam exists to stop.

Decrypt failure is a single opaque, fail-closed error. It does not distinguish a wrong key from tampered ciphertext from an identity mismatch, so it cannot become a decryption oracle, consistent with Secret-Free Logging.

The key layer below the engine is an acknowledged dependency, not decided here: root key placement, the resolution of an Organization Data Key then a Project Data Key then a per-record DEK, and the first-class rotation workflow all belong to ADR-0005. Whether key resolution is a distinct seam shared by the engine and rotation, and the exact rewrap mechanics the two-layer split enables, remain open and are the next thread. The Storage Security Gate (ADR-0005, ADR-0016) must continue to fail closed until that layer is implemented and verified.
