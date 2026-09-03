# @insecur/delivery-policy Context

Scoped context for agents working in `packages/delivery-policy`. This file is a
reading map, not an independent glossary.

## Role

This package owns the Delivery Risk Policy Preset model and the automation verdict for
non-protected delivery: whether a given coordinate may deliver without a human in the
loop, and the explicit opt-in that grants that for preview and development Environments.

## Read First

- `../../docs/adr/0043-delivery-risk-policy-presets.md`
- `../../docs/adr/0042-policy-gated-delivery-channels.md`
- `../../docs/adr/0016-delivery-first-secret-egress.md`
- `../../CONTEXT-MAP.md`
- `packages/protected-change/CONTEXT.md`

## Terms To Load

- `../../docs/context/glossary/project-secret-lifecycle.md`
- `../../docs/context/glossary/protected-change.md`

## Adjacent Terms

- Protected Environment approval rules live in `packages/protected-change/CONTEXT.md`.
- Step-up evidence lives in `packages/high-assurance/CONTEXT.md`.

## Owns

- Delivery Risk Policy Preset selection.
- Delivery automation resolution for a scoped coordinate.
- Preview automation opt-in: enable, revoke, eligibility loading.
- Single-use delivery policy change evidence consumption.
- Delivery policy audit records.

## Does Not Own

- Protected Change approval decisions (`@insecur/protected-change`).
- The delivery itself (`@insecur/secret-sync`, `@insecur/runtime-injection`).
- The Storage Security Gate verdict (`@insecur/storage-security-gate`).
