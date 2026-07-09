---
title: Security model
description: Boundaries, guarantees per environment tier, cryptography, and what is explicitly out of scope.
section: Concepts
order: 3
---

# Security model

This page states what insecur protects, how, and where the boundaries are. It errs on the side of underclaiming; a custody product that overstates its guarantees is worse than none.

## The guarantee differs by tier

|                               | Development environments                       | Protected environments                    |
| ----------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Plaintext at rest             | Never                                          | Never                                     |
| Value reaches your machine    | Yes, injected into one child process per grant | No                                        |
| Read-back through the product | No response body ever contains a value         | No read path exists at all                |
| Delivery requires             | A logged-in session and a one-use grant        | An environment-bound machine credential   |
| Change control                | Writes go live immediately                     | Draft versions, promotion, human approval |

For development, an agent-launched process holding the injected value is a process the agent controls, so a determined adversarial agent can read that value. The development guarantee is a small, recoverable blast radius: no file to scrape, no standing credential, one audited grant per use, cheap rotation. For protected environments, the readable value never reaches an agent-reachable machine, and no human session, CLI call, or agent channel can obtain a protected injection grant.

## Structural isolation, not conditionals

The system runs as capability-isolated deploys. The public API edge holds no decryption capability and no database binding. The private runtime service is the sole holder of the root key binding, the only place decryption happens, and serves zero public routes; it is reachable only over a private service binding. The web console and the public site hold neither. CI conformance gates fail the build if any deploy ever combines a public route with the root key, so the boundary cannot erode quietly in a refactor.

## Cryptography

Secret values are protected with AES-256-GCM envelope encryption under a tenant-bound key hierarchy: an instance root key wraps organization and project data keys, which wrap per-record data keys. Ciphertext is bound to its identity, so moving ciphertext between records fails closed. Key custody and rotation procedures harden further before general availability; current state is always reflected on the [security page](/security).

## Input hygiene the CLI enforces

- Secret values are never accepted as command-line arguments. Inputs are stdin (`--value-stdin`), masked prompts, service-side generation (`--generate`), or provider authorization. `--token` style flags are explicitly rejected.
- All CLI and API output is metadata-only by contract, enforced by shape checks and a no-plaintext canary test suite in CI.
- Crash reports and telemetry are sanitized metadata: never argv, environment, values, or transcripts.

## Accountability

Every meaningful action writes a tenant-scoped audit event carrying the principal chain: the human, the agent session acting under them, or the machine identity. Exports are signed (Ed25519) and independently verifiable against [published keys](https://insecur.cloud/.well-known/insecur/audit-export-signing-keys.json). The claim ceiling is tamper-evident and independently verifiable, nothing stronger.

## What we do not claim

- Not zero-knowledge. We do not claim the operator is technically incapable of accessing data. Operator access is constrained by controls and audit, and the trust model is published rather than hand-waved.
- No secrecy from your own runtime. A workload that receives a secret can do anything a process can do. insecur controls delivery and evidence, not what your code does afterward.
- [Local Mode](/docs/local-mode) is encrypted local custody, not no-reveal custody. The machine key lives on the same machine.
- No secure-erasure claims. `insecur local-files rm` is an ordinary filesystem delete.

## Reporting

Found a vulnerability? See the [security page](/security) for the current disclosure contact. Please do not test against other tenants' data.

## Related

- [How insecur works](/docs/how-it-works)
- [Audit and verification](/docs/audit)
- [Approvals and step-up](/docs/approvals)
