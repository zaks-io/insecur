# ADR-0018: Retire Unsafe Pre-V1 Scaffold

Date: 2026-05-23

Status: Accepted

The existing pre-v1 scaffold is disposable learning code, not a product mode to support, document, preserve for compatibility, or treat as evidence of intended product behavior. V1 implementation should replace unsafe scaffold surfaces with the production security baseline rather than carrying a weaker local, demo, or development deployment path forward.

## Consequences

Scaffold routes, auth flows, token handling, setup docs, and CLI behavior are deletion or replacement candidates. Existing code may be reused only after a targeted design and security review against the current V1 docs. Development prototypes may exist during implementation, but they must not become supported unsafe product paths or weaken the V1 release gates.
