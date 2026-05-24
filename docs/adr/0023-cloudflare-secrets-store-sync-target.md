# ADR-0023: Cloudflare Secrets Store Sync Target

Date: 2026-05-24

Status: Accepted

The **Sync Target** for a `cloudflare` **Secret Sync** is an account-level **Cloudflare Secrets Store** in the account **Connection Boundary**, not an individual Worker script. insecur writes and overwrites secrets in the store; binding stored secrets into Worker scripts through a `secrets_store_secrets` binding is the customer's responsibility and lies outside insecur's **Connection Boundary**. The Cloudflare **Connection Method** is unchanged from ADR-0011: a manually configured scoped Cloudflare API token, now requiring Secrets Store write permission on the account.

This supersedes the per-script Workers Secrets model assumed in ADR-0006, ADR-0011, `docs/architecture.md`, `docs/cli-and-sync.md`, `docs/project-status.md`, and `docs/security-plan.md`, all of which referred to "Cloudflare Worker secrets" and to pinning explicit target Workers.

## Considered Options

- Per-script Workers Secrets API (the originally documented model). Rejected for V1: it ties insecur to each Worker's lifecycle, multiplies the same write across every consuming script, and forces re-binding whenever a new Worker needs the secret.
- Support both the per-script API and the Secrets Store. Rejected for V1: two provider adapters and two **Connection Boundary** shapes for one provider, without a near-term need.

## Consequences

A `cloudflare` **Connection Boundary** pins a **Cloudflare Secrets Store** and account rather than Worker IDs. A **Managed Provider Delete** removes the secret from the store, which can break Workers still bound to it, so store-level deletes are surfaced as warnings. Consuming Workers need a customer-managed `secrets_store_secrets` binding that insecur never creates or modifies. The CLI surfaces a store-scoped target rather than `--target-worker-id`/`--target-account-id` worker pinning. A future per-Worker or install-style Cloudflare flow remains a separate decision and is not implied here.
