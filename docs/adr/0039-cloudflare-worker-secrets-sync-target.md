# ADR-0039: Cloudflare Worker Secrets Sync Target

Date: 2026-05-25

Status: Accepted

V1 Cloudflare Secret Sync targets direct per-Worker secrets on explicit Cloudflare Worker scripts, not account-level Cloudflare Secrets Store. This supersedes ADR-0023 because the beachhead workflow is deploying approved production secrets to a Worker without editing Wrangler configuration, and direct Worker secrets match that mental model better than an account-wide store plus customer-managed `secrets_store_secrets` bindings. A Cloudflare sync target records the account, Worker script name, and exact secret binding names; different insecur Environments can target different Worker script names, including Wrangler environment scripts such as `my-api-production`.

## Considered Options

- Account-level Cloudflare Secrets Store. Rejected for V1 customer sync: it is account-wide, requires a separate Worker binding recipe, and makes environment-specific delivery easier to misbind.
- Direct Cloudflare Worker secrets. Accepted for V1: it is the shortest path to "sync this production secret to this Worker environment" without insecur touching Wrangler files.
- Supporting both direct Worker secrets and Secrets Store. Rejected for V1: it creates two Cloudflare target models before the first workflow has proven value.

## Consequences

Cloudflare remains the manual-token exception until a suitable app or OAuth flow exists for Worker secret management. App connections pin the Cloudflare account and allowed Worker script targets, and Secret Syncs pin exact script names and binding names. Writing, updating, or deleting a Cloudflare Worker secret has provider-side deploy impact for that Worker script/environment, so protected sync plan, approval, and audit output must call it a production deploy and show the exact affected script and bindings without revealing Sensitive Values. When Promotion enqueues an already-enabled Cloudflare Secret Sync through Immediate Sync After Promotion, the accepted Approval Impact Review is the approval evidence for the resulting Worker secret deploy; creating, enabling, or changing the sync still requires the separate protected delivery configuration path. Cloudflare Secrets Store remains valid for insecur Instance key material under ADR-0028, but it is not the V1 customer Cloudflare Secret Sync target.
