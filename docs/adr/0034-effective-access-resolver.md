# ADR-0034: Authorization Through A Single Effective Access Resolver

Date: 2026-05-24

Status: Accepted

Every authorization decision runs through one Effective Access Resolver. A route asks the resolver "what can this actor do at this organization, project, and environment?" and gets back the actor's Effective Access, the set of Authorization Scopes CONTEXT already names the source of truth. The route then checks the one scope its action requires against that set with a plain membership test. Human actors (Membership plus Role expanded to scopes) and machine actors (Credential Scopes) resolve into the same kind of set, so there is one shape to test: given this stored state and this actor, here is the exact set. The scaffold's `canAccessProject` is retired with the rest of the pre-V1 code (ADR-0018), and its `if type === 'human' return true` bypass has no successor. A human with no scopes in the resolved set can do nothing; there is no early return left to forget.

Resolving to a set rather than answering a per-action yes/no is what makes the interface the test surface. A predicate hides every special case inside itself and forces enumeration of every actor-and-action pair to trust it; a resolved set is one enumerable value to assert against. The resolver owns its reads: it takes the actor and the Opaque Resource IDs of the coordinate, reads the Memberships that apply, expands their Roles into scopes, and unions the result. It is pure of identity resolution, never a slug lookup and never a not-found branch, but it is not pure of the metadata store, because selecting which Memberships apply is itself authorization logic and belongs inside the one module. Tests run it against a fake Tenant-Scoped Store, the same shape as the keyring's tests (ADR-0031).

Authorization keys on Opaque Resource IDs, not the scaffold's mutable slugs. The edge resolves a slug to its ID before the resolver is called, so a slug that names nothing is a 404 at the edge and never reaches authorization, a renamed resource keeps its ID and its scopes do not move, and 404 stays distinct from 403. This matches how the encryption thread already binds on Opaque Resource IDs (ADR-0026). Scopes are atomic capabilities, a verb fused to a resource kind such as `secret:read`, not the scaffold's two independent axes of projects times actions. The cross-product could not express "read on project A, write on project B" without also granting write on A; atoms can, because read-here and write-there are simply different atoms.

Two rules keep "what has access to what" unambiguous. First, one interpreter and one output form: the resource selectors carried by granted scopes on Memberships and Credential Scopes are read in exactly one place, the resolver, and everything downstream sees only the resolved coordinate-bound set, where each atom means exactly this verb on this resource kind at the coordinate asked. A route can never re-interpret a grant because it never sees one. Second, breadth is structural, not a token: there is no `*`. Reach comes from the tier a Membership sits at, an organization-tier Membership's scopes apply to every project in that organization by construction and a project-tier Membership's to that one project, so "all projects" cannot quietly become "all projects everywhere." The unscoped everything that made the human bypass dangerous has no form left to write down.

The resolver decides only within one Organization and never across, so "Organization Access never crosses Organizations" is provable in the resolver alone. Cross-organization operation is Service Access (ADR-0019), a separate bright-lined gate beside the resolver with its own authorization and audit, not a scope the resolver can emit. The resolver is also protected-ignorant: it answers only the scope question and is environment-aware, but the Protected Environment promotion and approval regime (ADR-0017) sits above it and owns whether a change may proceed. This is the same below-and-above split as the secret version store under promotion (ADR-0025): the resolver establishes capability, the layer above establishes approval.

## Consequences

The resolver's depth is that it concentrates actor-to-scope resolution, selector interpretation, Role expansion, tenant scoping, and the human and machine paths behind one boundary, so routes hold no authorization logic beyond a membership check against the returned set. Cross-tenant isolation, the death of the human bypass, and scope correctness are each a unit test against a fake Tenant-Scoped Store.

Because logical isolation makes authorization a tenant boundary (ADR-0027), a resolver bug that leaks a scope across Organizations is a tenancy breach, not a narrow access defect, so the cross-tenant authorization regression tests target the resolver directly.

Routes must resolve slug to Opaque Resource ID at the edge and check a named Authorization Scope, never a Role name or actor type, against the Effective Access set. A route that branches on `type === 'human'` or on a Role is the regression this ADR exists to prevent.

Service Access and Protected Environment approval are deliberately outside the resolver and remain their own gates. Folding either back in would re-open cross-organization reasoning or approval state inside the one module whose correctness the tenant boundary depends on.

The resolver resolves a set of Opaque Resource IDs in one batch read, never a query per ID. A single read selects the actor's applicable Memberships for the Organization, the organization-tier ones and the project-tier ones for the requested project IDs together (`project_id = ANY($ids)`), and Role expansion and the org-tier/project-tier union run over that one result; the machine path's Credential Scopes already ride with the authenticated principal, so the N+1 risk is only the membership path. Within a single request the actor's applicable Memberships are read once and every subsequent scope check is answered from the in-memory set, so N authorization checks cost one read rather than N; this is request-scoped only and never cached across requests, where stored state may have changed. The guarantee is tested directly: resolving one resource ID and resolving fifty issue the same number of database round-trips, asserted beside the union-correctness and cross-tenant regression tests this ADR already requires.

## Amendment (2026-06-12): Registry conformance suite encodes the role-bundle relational invariants

Product-spec section 4 names `packages/access/src/authorization-scopes.ts` and
`packages/access/src/built-in-role-scopes.ts` as the canonical registries for atom names and preset
bundles, and declares the relational constraints in the spec and CONTEXT.md "normative invariants
those bundles must satisfy." This amendment designates the executable bridge between that prose and
the registries: a registry conformance suite in `packages/access` that encodes the relations as set
assertions over the existing registries themselves, never as snapshots of bundle contents. A
snapshot expectation ratifies drift, because the same edit that changes a bundle also updates the
matching expectation; a set assertion states the relation, so a bundle change that violates it
fails no matter what else the editor rewrites. The suite is unit tests in the unit layer of
ADR-0065's three-layer model, running under the existing unit-test fan-out — no new layer, no new
command, no new seam. A violating bundle change fails `pnpm verify`.

The assertions:

- The owner bundle includes every approval scope.
- The admin bundle and the approval scopes are disjoint, and the developer bundle and the approval
  scopes are disjoint.
- The Approval Role bundle carries no configuration or membership scopes.
- The Metadata Viewer Role bundle carries no delivery, injection, sync, mutation, or approval
  scopes, and the metadata-viewer preset is not machine-assignable.
- `MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES` includes every existing atom corresponding to an
  ADR-0004-forbidden capability — today `approval:approve`, `approval:reject`, `membership:manage`,
  `project:configure`, and `onboarding:guided_organization_provision`.

The suite binds only over atoms that exist in `authorization-scopes.ts` today (thirteen). No Secret
Delivery, Secret Sync, App Connection, Service Access, or protected-issuance atoms exist yet, so
ADR-0004's prose list of machine-forbidden capabilities — promotion completion, rollback, retention
change, Runtime Injection Policy change, Secret Sync change, App Connection change, Shared Secret
Source attachment, Service Access mutation, Signup Lockdown, Tenant Suspension — is only partially
encodable until those atoms land. The growth rule is normative: a new atom in a category a relation
covers is added to the relevant assertions in the same change that introduces it. The suite never
names an atom that does not exist.

Classification of atoms into the categories the relations quantify over (approval, configuration,
membership, mutation, read, injection, and later delivery and sync) is explicit, not implicit.
Where the `resource:verb` shape determines the category, it is derived from the prefix —
`approval:*` is the approval category, `runtime_injection:*` is injection. Every atom whose
category the prefix does not determine appears in an explicit category map inside the test:
`project:configure` is configuration while `project:read` is read, and `secret:non_protected_write`
and `onboarding:guided_organization_provision` are mutations. An unclassified new atom is a test
failure, not a silent exemption; leaving classification implicit is how a future change would
quietly weaken the suite by miscategorizing an atom out of an assertion.

For accuracy about the prior state: the existing tests partially encode these relations, and the
defect is incomplete coverage plus snapshot form, not total absence.
`packages/access/test/built-in-role-scopes.test.ts` asserts that admin lacks `approval:approve` and
guided provisioning, and pins the Approval Role bundle by exact equality;
`packages/access/test/intersect-effective-access-scopes.test.ts` spot-checks four of the five
machine-forbidden entries. But owner is checked for `approval:approve` and never `approval:reject`,
the developer bundle is never checked against approval scopes at all,
`onboarding:guided_organization_provision`'s membership in the forbidden set is asserted nowhere,
and the enumerate-style expectations get rewritten alongside any bundle edit. The conformance suite
supersedes none of those tests; it adds the relational layer they lack.

Sequencing. The metadata-viewer assertions land with the six-role registry change:
`built-in-role-scopes.ts` still implements the five-preset set, a divergence the ADR-0001 and
ADR-0003 amendments (2026-06-11) record, so those assertions — including whatever registry form the
not-machine-assignable rule takes — are written when the metadata-viewer bundle is. The
protected-issuance assertion — `runtime_injection:grant_issue_protected` absent from every human
role bundle and absent from `MACHINE_FORBIDDEN_AUTHORIZATION_SCOPES`, because under ADR-0038 a
machine credential is the only legitimate issuer of a Protected Environment Injection Grant — ties
to the ADR-0038 amendment that introduces that atom and is severable; the rest of the suite does
not block on it. Implementing the suite is a follow-up ticket; this amendment fixes the contract it
must satisfy.
