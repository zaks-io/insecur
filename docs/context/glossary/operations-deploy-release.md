# Operations, Deploy Topology, And Release Gates

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

### Deploy Topology

The capability-isolated Worker deploys (ADR-0051, ADR-0064, ADR-0077). Capability isolation is structural: separate deploys, separate token audiences, and private Service Bindings, never role conditionals in one shared isolate. The deploy-topology conformance gate (`scripts/ci/deploy-topology-conformance.mjs`) and the lint keyring boundary make this an enforced invariant.

**API Worker**:
The public caller-agnostic edge deploy (`insecur-api`). It authenticates Actors (CLI, agent, CI, and the Web Console BFF) and composes the domain package Interfaces into public routes. It holds **no Keyring**: it does not declare the **Instance Root Key** binding, so no route on it can build a Keyring. Keyring-bound work is forwarded to the **Runtime Worker** over the private `RUNTIME` Service Binding with a scoped, audience-bound hop token.
_Avoid_: "the worker" or "the monolith" when the public edge deploy is meant; gateway

**Runtime Worker**:
The decrypt-egress deploy (`insecur-runtime`): the sole holder of the **Instance Root Key** and the only place the **Encryption Envelope** turns ciphertext into plaintext. It is the deploy-level expression of the **Encryption Envelope**'s decrypt-import allowlist ([ADR-0071](../../adr/0071-decrypt-egress-import-boundary.md)) — Keyring construction is fenced to its source tree by the lint boundary. It serves zero public routes and is reachable only over the private Service Binding via the `RuntimeService` RPC seam. Authorization and decryption are one indivisible call inside it (the resolver runs before the Keyring is touched). Secret Sync, when built, runs inline here ([ADR-0057](../../adr/0057-inline-sync-execution-and-partial-failure-model.md)).
_Avoid_: crypto service, sync worker, or "the worker" when this private decrypt-egress deploy is meant

**Web Console BFF**:
The browser-facing deploy (`insecur-web`, deferred to Cut 2): the only deploy the browser talks to, holding the session cookie and reaching the **API Worker** over a private Service Binding with a per-request `insecur-api`-audience token. It holds no Keyring and no database binding.
_Avoid_: frontend, SPA backend when the session-holding edge-for-the-browser is meant

**Service Access Surface**:
The deferred cross-Organization audited deploy (`insecur-service-access`, name reserved, not built — ADR-0019). Its separate-deploy and no-reveal constraints remain binding even while deferred; a negative conformance assertion keeps any reveal/value/delivery/approval scope out of every V1 deploy.
_Avoid_: admin API, internal API when the deferred audited cross-tenant surface is meant

### Operations And Release Gates

**Security Runbook**:
A documented operational procedure for a security-sensitive setup, response, recovery, or verification workflow, with dry-run, execution, verification, expected audit events, and recovery notes.
_Avoid_: checklist when the procedure has authority and audit requirements

**Security Release Gate**:
A required readiness decision that blocks production use, broad public signup, production deploy, migration, or sensitive-surface change until the needed security evidence is present.
_Avoid_: reminder, checklist item when the gate can block release

**Security Evidence Bundle**:
A metadata-only set of test runs, review IDs, runbook drill IDs, ADR links, audit export IDs, migration IDs, scan reports, and CI job IDs used by a Security Release Gate.
_Avoid_: artifact bundle when it might imply Sensitive Values or raw logs are included
