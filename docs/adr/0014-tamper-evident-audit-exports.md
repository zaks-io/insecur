# ADR-0014: Tamper-Evident Audit Exports

Date: 2026-05-23

Status: Accepted

Audit exports must be tamper-evident before public multi-tenant use, but the first design should stay simple: tenant-bounded JSONL audit entries, a per-export hash chain over canonicalized entries, and an HMACed manifest. The goal is practical integrity verification for humans and agents, not a heavy compliance ledger.

## Consequences

The export manifest should include organization, time range, entry count, first hash, last hash, hash algorithm, HMAC key version, and HMAC. HMAC provides integrity and authenticity for systems that can access the verification key; it is not public-key non-repudiation. If third-party verification becomes necessary later, add asymmetric signing as a separate decision.
