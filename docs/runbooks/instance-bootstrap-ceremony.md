# Runbook: Instance Bootstrap Ceremony (Seed And First Operator Claim)

Operator entrypoint for bringing a freshly-deployed Instance from `not_bootstrapped` to
`complete` with an admitted first Instance Operator, without hand-writing SQL (INS-420).
The runner executes the real ceremony code (`runInstanceBootstrap` +
`completeBootstrapOperatorClaim`), and the claim admits the operator atomically with the
grants (INS-419), so a real console login works immediately afterwards.

The runner mints the Bootstrap Secret itself and consumes it in the same process; the
secret is never printed, persisted, or reusable.

## when_to_use

- **Triggers:** a freshly-deployed environment whose
  `GET /v1/instance/bootstrap/status` returns `phase: "not_bootstrapped"`; standing up a
  recreated database (prelaunch posture is recreate, not migrate).
- **Non-triggers:** an instance whose phase is already `complete` (the runner exits as a
  no-op and reports `alreadyComplete`); admitting additional teammates (Invitations own
  that); root-key setup (`instance-root-key-bootstrap.md`).

## preconditions

- Schema applied (the deploy workflow runs migrations before deploying Workers).
- `DATABASE_URL_RUNTIME` for the target environment exported in your shell (Neon runtime
  role connection string; local runs fall back to the repo `.env.local`). Never echo it.
- The operator's WorkOS user id for that environment's WorkOS environment (see
  `seed-owner-admission.md` preconditions for how to look it up; staging and production
  WorkOS environments have different `user_…` ids for the same email).
- The environment's WorkOS client id (GitHub Environment variable `WORKOS_CLIENT_ID`).

## steps

1. Run the ceremony:

   ```sh
   INSTANCE_ID=inst_PREVIEW \
   INSTANCE_DISPLAY_NAME="insecur preview" \
   ORGANIZATION_DISPLAY_NAME="Zaks.io" \
   OPERATOR_WORKOS_USER_ID=user_… \
   WORKOS_CLIENT_ID=client_… \
   pnpm --filter @insecur/instance-bootstrap bootstrap:ceremony
   ```

   Success prints one JSON line with `ok: true`, `phase: "complete"`, and
   `admitted: true` (the runner reads the admission back through the exact resolution
   login performs and fails loudly if the operator would not resolve).

2. Verify against the deployed edge: `GET <api origin>/v1/instance/bootstrap/status`
   returns `phase: "complete"`.

3. Verify login end to end at the environment's web origin. The session must satisfy the
   assurance gate (ADR-0009/0010): Passkey sign-in or an enrolled TOTP factor, never SMS,
   which requires Multi-factor auth or Passkeys enabled in the WorkOS environment
   (Authentication → Features).

## failure modes

- `bootstrap.already_bootstrapped` / an `awaiting_operator_claim` guard error: an earlier
  partial ceremony (or manual seeding per `seed-owner-admission.md`) left instance state
  behind. The pending claim's secret is unknowable to a new run; recreate the database
  and re-run, or complete the original claim.
- Admission unique-key violation inside the claim: the operator's WorkOS subject already
  has an admission row for this instance (manual seed). The whole claim rolls back; a
  fresh database is the supported path.

## notes

- Once per database, like the manual seed: deploys migrate and upsert, never wipe.
- The manual raw-SQL fallback is `seed-owner-admission.md`; prefer this ceremony, which
  exercises the product path and leaves complete bootstrap state (instance configuration,
  first Organization, Default Team, consumed claim, audit records).
