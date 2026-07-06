# Runbook: Seed The First Owner Admission (Preview / Production)

Interim operational runbook. The product has no self-serve path that admits the
first User: login resolves the WorkOS subject against persisted `user_admissions`
rows, Guided Organization Provisioning only runs for admitted Users, and the
Instance Bootstrap operator claim itself requires an already-admitted actor
(`requireUserActor`), so the first human can never get in without a seeded
admission row. INS-417 tracks the product fix (the bootstrap ceremony must admit
the WorkOS subject presenting the valid Bootstrap Secret). Until that ships, the
first owner admission for each environment's database is seeded manually with the
steps below.

The deploy workflows already do this for the synthetic smoke actors
(`packages/tenant-store/scripts/seed-preview-smoke-admission.mjs`); this runbook
is the same upsert for a real human owner.

## when_to_use

- **Triggers:** standing up a fresh environment database (preview or production)
  that has no admitted human owner yet; recreating an environment database from
  scratch (prelaunch posture is recreate, not migrate).
- **Non-triggers:** admitting additional teammates into an environment where an
  Instance Operator already exists (use Invitations once that surface ships);
  anything after INS-417 lands (use the real bootstrap ceremony instead and
  delete this runbook).

## preconditions

- The environment's Workers are deployed and `pnpm migrate:preview` (or the
  production equivalent in the deploy workflow) has applied the schema.
- You know the environment's Instance id: `PREVIEW_INSTANCE_ID` /
  `PRODUCTION_INSTANCE_ID` in the matching GitHub Environment
  (`inst_PREVIEW` / `inst_PRODUCTION` today).
- You know the owner's WorkOS user id **for that environment's WorkOS
  environment**. Staging (preview) and Production are separate WorkOS
  environments with different `user_…` ids for the same email. Look it up in the
  WorkOS dashboard under the environment's **Users** page. The user record only
  exists after a first AuthKit sign-in attempt (the attempt may bounce back to
  `/login`; that is expected before this seed).

## steps

1. Mint three fresh Opaque Resource IDs (prefix + 26 Crockford base32 chars,
   the same shape `generateOpaqueResourceIdForPrefix` produces):

   ```sh
   node -e '
   const A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
   const gen = (p) => p + "_" + Array.from(crypto.getRandomValues(new Uint8Array(26)), b => A[b % 32]).join("");
   console.log(JSON.stringify({ userId: gen("usr"), admissionId: gen("uad"), operatorId: gen("iop") }));
   '
   ```

2. Run the seed against the environment's Postgres branch (Neon console, or any
   client holding the migration role connection string). Production's database
   starts empty, so the `instances` row insert matters there; preview's deploy
   workflow already created it.

   ```sql
   INSERT INTO instances (id, display_name)
   VALUES ('<INSTANCE_ID>', '<display name>')
   ON CONFLICT (id) DO NOTHING;

   INSERT INTO user_admissions (id, instance_id, user_id, workos_user_id, display_name, status)
   VALUES ('<uad_…>', '<INSTANCE_ID>', '<usr_…>', '<user_… WorkOS id>', '<owner name>', 'active')
   ON CONFLICT (instance_id, workos_user_id) DO UPDATE
   SET status = 'active', revoked_at = NULL, display_name = EXCLUDED.display_name, updated_at = now();

   INSERT INTO instance_operators (id, instance_id, user_id, grant_origin)
   VALUES ('<iop_…>', '<INSTANCE_ID>', '<usr_…>', 'admin')
   ON CONFLICT (id) DO NOTHING;
   ```

3. Verify login end to end: sign in at the environment's web origin (for
   example `https://app.preview.insecur.cloud/login`). The session must satisfy
   the assurance gate in `packages/auth/src/session-assurance.ts` (ADR-0009/0010):
   a Passkey sign-in or an enrolled TOTP factor, never SMS. AuthKit only produces
   those when the WorkOS environment has **Multi-factor auth** (or Passkeys)
   enabled under Authentication → Features; with them disabled every login
   bounces back to `/login` with no error shown.

## notes

- The seed is once per database. Deploys migrate and upsert; they never wipe.
  Re-run only after deliberately recreating a database.
- The seeded owner is admitted and holds an Instance Operator grant, so Guided
  Organization Provisioning auto-creates the Personal Organization on first
  authenticated visit; no organization rows are seeded here.
- Done means: the owner reaches the console (`/orgs`) signed in, and
  `user_admissions` shows the row `active` for the environment's instance id.
