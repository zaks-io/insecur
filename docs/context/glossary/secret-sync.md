# Secret Sync And Provider Targets

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Secret Sync And Provider Targets

**Secret Sync**:
A project-level rule that pushes explicitly bound environment secrets to a sync target through an app connection.
_Avoid_: integration, deploy, replication

**Secret Sync Binding**:
An exact mapping from one Secret in one Environment to one provider-side secret or variable name inside a Secret Sync.
_Avoid_: all secrets, tag selector, prefix selector, sync the environment; use Secret Sync with exact Secret Sync Bindings, remove from sync; removing a Secret Sync Binding creates a Managed Provider Delete for its managed provider-side copy

**Provider Sync Overwrite**:
A Secret Sync write that replaces the provider-side value for a bound destination without reading the previous provider-side Sensitive Value.
_Avoid_: import, reconcile, overwrite provider secret when a Secret Sync replaces a bound provider-side value

**Provider Overwrite Warning**:
A metadata-only warning that an exact Secret Sync Binding destination already exists in the provider and will be replaced by Provider Sync Overwrite if the sync is approved or run.
_Avoid_: import prompt, provider diff, already set in the provider when an exact Secret Sync Binding destination exists before sync

**Sync Execution Revalidation**:
The pre-decrypt check that a Secret Sync run performs immediately before provider writes to confirm the current provider identity, boundary, target, protection state, and source version still match authorized configuration.
_Avoid_: plan validation when execution authorization is meant, preflight check when the check gates decrypt and provider writes

**Inline Sync Execution**:
A Secret Sync run that performs provider writes synchronously within the triggering request rather than handing them to a background queue, retrying transient provider failures in-request with backoff.
_Avoid_: queued sync, background job, dead-letter when the run is synchronous

**Incomplete Sync Run**:
A Secret Sync run that started provider writes and could not finish them all, leaving some Secret Sync Bindings written and others not; it records per-binding write status and stays resumable by its Operation, distinct from a run that the All-Or-Nothing Sync Pre-Write Gate blocked before any write.
_Avoid_: failed sync, rolled-back sync, partial when the pre-write gate blocked all writes

**Sync Run Resume**:
Re-running an Incomplete Sync Run under its original Operation, which re-runs Sync Execution Revalidation and writes only the Secret Sync Bindings not yet confirmed written.
_Avoid_: new sync run, retry that rewrites already-confirmed bindings

**Sync Target Serialization**:
The guarantee that at most one Secret Sync run writes to a given provider target at a time, so concurrent runs cannot interleave Provider Sync Overwrite writes to the same destination.
_Avoid_: global sync lock across unrelated targets, queue ordering

**Secret Sync Disable**:
A non-destructive action that stops future Secret Sync writes while leaving existing provider-side managed copies in place.
_Avoid_: delete when pausing delivery

**Secret Sync Deletion**:
A destructive action that removes a Secret Sync, removes all of its bindings, and attempts to delete the provider-side copies managed by those bindings.
_Avoid_: disable when provider-side copies will be deleted

**Managed Provider Delete**:
A Secret Sync operation that deletes a provider-side secret or variable previously written for a removed Secret Sync Binding.
_Avoid_: cleanup when provider-side deletion is meant

**Orphaned Managed Provider Copy**:
A provider-side secret or variable whose cleanup state is unknown after insecur could not complete Managed Provider Delete. Each record has the lifecycle `open -> cleaned | acknowledged` (both exits terminal), and cleanup is retried by re-invoking `syncs delete`, which creates an orphan-cleanup Operation, per [ADR-0075](../../adr/0075-orphan-cleanup-is-a-new-operation.md).
_Avoid_: deleted when provider cleanup failed, failed provider cleanup when a managed provider-side copy may still exist, orphan value when provider cleanup may have failed; not a stored insecur Sensitive Value

**Immediate Sync After Promotion**:
The rule that promotion immediately runs enabled secret syncs affected by promoted versions through Inline Sync Execution after Protected Promotion Sync Preflight passes.
_Avoid_: scheduled sync when no scheduling policy exists, enqueued or deferred sync, schedule sync is deferred for v1; use Immediate Sync After Promotion for approved protected changes

**Provider Readback**:
Reading a Sensitive Value back from an external provider secret store.
_Avoid_: verification when only provider metadata or status is checked, verify sync should not imply Provider Readback; verification checks provider metadata and status

**Secret Import**:
A controlled non-protected development adoption helper that creates new insecur Secrets and Secret Versions from Sensitive Values supplied through Safe Sensitive Input Paths.
_Avoid_: sync reconciliation, provider readback, steady-state refresh, rotation, file reload, sync import is unsafe; Secret Import for a value entering insecur (vs Secret Sync for a value leaving)

**Explicit Provider Lookup**:
An audited provider API check for one exact configured Secret Sync Binding destination that returns minimal existence/status metadata for setup, planning, or approval without listing provider inventory or reading Sensitive Values.
_Avoid_: provider inventory discovery, provider list, standalone provider probe, provider probe; Explicit Provider Lookup is not a standalone UI, API, or CLI command in V1

**Provider Lookup Status**:
A normalized safe result code for Explicit Provider Lookup that replaces provider-native error text.
_Avoid_: raw provider error, provider message

**Operation**:
A trackable long-running workflow such as a sync, rotation, backup, restore, or provider reauthorization.
_Avoid_: job when referring to the user-visible workflow

**Operation Store**:
The durable metadata Module for **Operations**, idempotency, wait/retry state, cancellation, Sync Target Serialization leases, fencing tokens, and audit references. Its canonical Interface lives in `docs/operation-store.md`.
_Avoid_: job queue when the durable user-visible workflow record is meant, provider adapter when live provider work is meant

**Sync Target**:
An external destination that receives secrets from a secret sync.
_Avoid_: environment when referring to an external provider destination

**GitHub Environment**:
A GitHub provider resource inside a repository used to scope Actions secrets and deployment behavior.
_Avoid_: Environment when the insecur project environment is meant, environment; qualify the provider term as GitHub Environment vs insecur Environment

**GitHub Environment Protection**:
Provider-side protection rules on a GitHub Environment that make it acceptable for protected production secret sync; insecur's minimal bar is a deployment branch policy restricting the environment to selected or protected branches, with required reviewers recommended.
_Avoid_: environment exists when protection is meant, wait timer alone as sufficient protection, protected GitHub environment when the provider-side rules are the security gate

**GitHub Repository Secret**:
A repository-wide GitHub Actions secret scope that is an allowed Sync Target only for a non-protected insecur Environment; values written here are visible to every workflow in the repository.
_Avoid_: repo secret, organization secret, environment secret when the repository-wide scope is meant, repo secret for repository-wide provider scope (vs project-specific Secret Sync for insecur's Project boundary)

**Cloudflare Worker Script**:
A Cloudflare provider deployment target, including a Wrangler environment script, that can hold direct per-script secret bindings.
_Avoid_: Environment when the insecur **Environment** is meant, project when the Cloudflare script is meant

**Cloudflare Worker Secret**:
A direct per-script Cloudflare secret binding that is the V1 **Sync Target** for a `cloudflare` **Secret Sync**.
_Avoid_: Cloudflare Secrets Store, account-level secret, `secrets_store_secrets` when the per-script secret binding is meant

**Cloudflare Worker Secret Deploy**:
The provider-side deploy effect caused by adding, updating, or deleting a **Cloudflare Worker Secret** on a **Cloudflare Worker Script**.
_Avoid_: metadata sync, binding recipe when the provider makes the secret change live

**Cloudflare Secrets Store**:
An account-level Cloudflare secret vault used for insecur **Instance** key material in the current architecture, not the V1 customer `cloudflare` **Secret Sync** target.
_Avoid_: Cloudflare Worker Secret, per-script secret, customer sync target when the account-level vault is meant

**Vercel Deployment Target**:
The Vercel-side scope a vercel Secret Sync writes to, limited to production and preview because insecur writes only write-only sensitive variables, optionally narrowed to a git branch for preview; it is configured explicitly on the Sync Target, not inferred from the insecur source Environment.
_Avoid_: Environment when the insecur project environment is meant, target when the Sync Target as a whole is meant, development or custom environment as a supported insecur sync scope
