# ADR-0014: Tamper-Evident Audit Exports

Date: 2026-05-23

Status: Accepted (amended by ADR-0045, which adds asymmetric signing in V1)

Audit exports must be tamper-evident before v1 production use, but the first design should stay simple: tenant-bounded JSONL audit entries, a per-export hash chain over canonicalized entries, and an HMACed manifest. The goal is practical integrity verification for humans and agents, not a heavy compliance ledger.

## Consequences

The export manifest should include organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC. HMAC provides integrity and authenticity for systems that can access the verification key; it is not public-key non-repudiation. If third-party verification becomes necessary later, add asymmetric signing as a separate decision.

Some audit fields are Sensitive Metadata even though they are not plaintext secrets. Provider target names and policy binding names must be encrypted at rest under tenant-bound data keys. They may appear in full-fidelity exports for authorized security review after Sensitive Detail Gate. Historical Display Names may appear as ordinary audit metadata. Low-privilege exports must use immutable IDs and hashes and exclude Sensitive Metadata that reveals security-relevant structure.
