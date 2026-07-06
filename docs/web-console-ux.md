# Web Console UX

Design decisions for the tenant web console (`apps/web`), resolved 2026-07-04. This doc owns the
reversible UX choices that ADR-0051 explicitly left below the ADR line: information architecture,
onboarding flow, and surface design. It does not restate what its owners already decide: scope and
surfaces ([product-spec §10](specs/product-spec.md)), stack (ADR-0051), the no-reveal boundary
(ADR-0052), onboarding model (ADR-0040/0063), step-up model (ADR-0032), workstream boundary
([W9](specs/agent-workstreams.md)).

Design target: the full management-parity console. V1 (metadata browsing, Human Approval Surface,
and the first-run onboarding wizard, per product-spec §10) is carved out of this design, not
designed separately.

## Center Of Gravity: Oversight-First

The console is an oversight-and-trust surface that also has full management capability, not a CRUD
tool with an approvals tab. A logged-in user with an existing org lands on **Home**: a "Needs You"
strip (pending Approval Requests and High-Assurance Challenges) above a recent-activity feed.
Management is one level down.

## Navigation

Five sidebar sections, org-scoped:

1. **Home** — Needs You + recent activity.
2. **Projects** — project list; each project has sub-nav: Environments / Secrets / Access / Delivery.
3. **Audit** — full filterable metadata event log (actor, project, environment, event type, time
   range). Promoted to a first-class section deliberately: metadata richness is the visible product
   strength when values can never render.
4. **People** — members, teams, invitations (conventional).
5. **Settings** — org configuration, policies.

## URLs

Opaque Resource IDs throughout, following the API's opaque-ID style:
`/orgs/:orgId/projects/:projectId/envs/:envId/...` for resource pages. No slug columns, no
rename/redirect handling; in-page breadcrumbs carry Display Names. Approval deep links are the one
deliberate short form: `/orgs/:orgId/approvals/:id` accepts both an Approval Request ID and a
High-Assurance Challenge bounded operation ID (distinct, separately governed objects per
docs/cli-and-sync.md); the console resolves which by opaque ID prefix and renders the matching
review view. Deep links stay short because they are typed into notifications and printed by the
CLI, while the underlying API routes remain env-scoped.

## Project Secrets View: Matrix

Rows are secret names, columns are the project's Environments; cells carry presence + version +
last-set metadata, protected columns marked. Cross-environment drift ("prod on v3, staging on v1,
preview missing") is the page's headline information. Clicking a cell opens secret-in-environment
detail (version history, actors, grant usage). Preview-environment column folding is deferred until
preview envs are numerous.

## Blind Secret Write Flow

One dialog, reachable from "+ New secret" and from any matrix cell (cell pre-fills name and
environment): name, masked value input, environment checkboxes (protected envs marked and subject
to whatever the policy demands), and a "Generate instead" toggle that swaps the value field for
generation options so the value is created server-side and never touches the browser. Paste is
first-class (most secrets are provider-issued); generation is offered, not forced. Confirmation is
a **Metadata Receipt** (see glossary) only.

## Human Approval Surface

- **Approval detail** shows full metadata evidence: what changes (environment, secret names,
  delivery target, config diff), who staged it with the full principal chain, when, and what has
  gone stale since staging.
- **Approve** triggers the per-action High-Assurance Challenge (passkey). No typed-name
  confirmation rituals: the challenge is the structural gate, evidence supplies deliberateness.
  **Reject** is one click with optional reason.
- **Round trip**: the staging CLI/agent prints the approval deep link and polls the operation;
  the alert-only email notification fires; Home's Needs You updates live (SSE per ADR-0051). On
  approval the polling caller unblocks automatically. The link is transport only; clearing happens
  exclusively in the authenticated console with the passkey.
- The approval detail page is fully responsive (deep links get tapped on phones). The rest of the
  console is desktop-first.

## First-Run Onboarding

The wizard drives Guided Organization Provisioning to completion, then sets the table for the CLI:

1. Name the Personal Organization (create-only, ADR-0063).
2. Enroll the approval passkey, framed by purpose ("this key approves production changes").
   Skippable with a persistent nudge until enrolled; enrolling here keeps the first real approval a
   single tap instead of an enroll-under-pressure moment.
3. First Project (+ dev Environment auto-created).
4. Optional first Blind Secret Write.
5. CLI handoff pane with copy-paste commands pre-filled with real IDs, plus a live "waiting for
   your first run" indicator that celebrates the first Runtime Injection event over SSE.

## Project Access Page

Read-rich: Machine Identities, active/consumed grants, agent-session attribution. A guided GitHub
Actions OIDC setup runs fully in-browser (repo/environment claims + a non-secret workflow snippet;
nothing secret is involved). Environment Deploy Key issuance is CLI-only; the console shows key
existence and metadata, never material (ADR-0052 amendment 2026-07-04). The console has rendered
zero secret bytes, ever — including insecur's own credentials.

## Actor Rendering

Every non-human actor renders with its principal chain everywhere it appears: Agent Sessions as
"agent <id> (<harness>) · under <human>" (token-accurate, groupable per session), CI as
"<run> · <machine identity>", and self-reported Agent Attribution Tags on bare human tokens as
"<human> · via <harness> (unverified)". No bare robot identities in activity, audit, or approval
evidence. Attribution semantics are owned by the ADR-0032 amendment of 2026-07-04 and
docs/cli-and-sync.md; the console renders them.

## Visual Direction

The console adopts `@insecur/ui` (Tailwind v4 + shadcn, radix-nova, neutral base) and inherits the
marketing site's light editorial look wholesale: one design system, one temperament, zero extra
theming. Metadata-dense elements (IDs, versions, receipts, audit rows) use mono within that theme.
The hand-rolled `apps/web/src/styles.css` is deleted in the adoption pass. All styling flows
through the existing CSP nonce mechanism.

## Open Branches (not yet designed)

- **App Connection wizard** (ADR-0011 makes the web the canonical provider-connection surface):
  flow not yet designed.
- **Delivery sub-page** content beyond the approval evidence it feeds.
- **Settings** information architecture (org config, parity narrowing controls, billing later).
- Preview-environment folding in the secrets matrix.
