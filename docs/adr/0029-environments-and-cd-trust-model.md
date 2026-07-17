# ADR-0029: Single-Account Environments And CD Trust Model

Date: 2026-05-24

Status: Accepted

Amended: 2026-05-25 (deploy identity must be a machine identity distinct from the human approver)
Amended: 2026-07-03 (prelaunch production deploy auto-runs after successful CI on main)
Amended: 2026-07-03 (routine CI deploys must not hold Secrets Store write access)
Amended: 2026-07-09 (runtime deploy reconciles configured observability destinations)
Amended: 2026-07-09 (production requires exact-SHA CI and deployed Preview Smoke evidence)
Amended: 2026-07-17 (daily exact-SHA Preview-to-Production release train)

The project runs staging and production as two `wrangler` environments inside one Cloudflare account, not as separate accounts. Pull requests run typecheck, build, tests, and the security gates (ADR-0008). During prelaunch, the `Daily Release` workflow runs at 08:43 America/Los_Angeles and may also be dispatched without inputs. It selects the newest successful `CI` push run on `main`, rejects history divergence, deploys that exact commit to the shared Preview fleet, runs the real Preview Smoke, and deploys the same source commit with Production bindings only after the smoke succeeds. The `production` branch records the last successfully verified live release and advances by fast-forward only after Production health, Sentry source maps, and Linear release sync succeed. A failed stage leaves the branch unchanged; a later release run retries the newest eligible commit. The production job is bound to the `Production` GitHub Environment and the executor is a CI machine identity (ADR-0004); the operator's personal credentials are never the deploy credential. Cloudflare offers no GitHub OIDC federation for Wrangler deploys, so CI authenticates with a stored Cloudflare API token scoped to Worker script and asset deployment. Routine CI deploys do not hold Secrets Store write access or Workers Routes write access: the Runtime Worker deploy reconciles only its code-owned observability settings to pre-existing account destinations, then uploads code through Cloudflare's content-only endpoint after checking that the already-deployed root-key Secrets Store binding and Hyperdrive binding match `apps/runtime/wrangler.jsonc`; routed Worker deploys use route-preserving Wrangler config copies that omit production custom domains during upload. Account-level observability destination creation, Runtime binding and root-key custody changes, and custom-domain route changes remain operator-controlled Cloudflare changes. Neon migrations apply in the production release under an elevated database role, expand-contract and backward-compatible once real production data exists, with a fresh R2 backup or snapshot taken immediately before apply so a live multi-tenant secrets database stays recoverable if a migration misbehaves.

## Considered Options

- **Separate Cloudflare accounts** for staging and prod, giving each its own account-level Secrets Store and a CF-enforced blast-radius boundary. Rejected for now in favor of operational simplicity and a single bill.
- **Out-of-CI manual production deploy** so no automated identity holds root-key-equivalent power. Rejected: it loses the value of automated release flow that the operator wanted.

## Consequences

Because Secrets Store is account-level and has no per-Worker binding ACL (ADR-0028), one account means the staging/production root-key boundary is enforced by configuration review, deploy-token scope, the Production GitHub Environment protected-branch policy, and restricting Secrets Store account roles to the operator alone, **not** by Cloudflare. Two constraints follow and are non-negotiable while single-account holds: the staging environment must never hold real customer secrets, and account membership with Secrets Store roles stays limited to the operator. The accepted residual risk is that a CI-gated production deploy can ship Runtime code that reads the already-bound production root key, or that a single-account operator configuration change can alter root-key custody or route attachments. Routine CI cannot overwrite the Secrets Store root key because it does not hold Secrets Store write permission, and it cannot mutate custom-domain route attachments because it does not hold Workers Routes write permission. The trigger to split into separate accounts is a second operator or a real staging dataset.

If a human approval gate is reintroduced after launch, it only constrains automation if the approver and the executor are different identities. If a local agent or human session ever held the deploy credential directly, it could both approve and execute, collapsing the gate into a formality. Keeping the deploy credential a CI-held machine identity (ADR-0004), never the operator's personal token, is therefore non-negotiable while this model holds.
