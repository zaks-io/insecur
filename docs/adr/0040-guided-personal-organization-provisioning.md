# ADR-0040: Guided Personal Organization Provisioning

Date: 2026-05-25

Status: Accepted

V1 will create a Personal Organization automatically for an admitted user during Public Onboarding, instead of requiring an Instance Operator to create every customer Organization manually. The first experience should center on product value: the flow creates a Default Team, first Project, and non-protected development Environment with default names, then helps the user complete a provider-free First Value Proof using the normal secret-write and runtime-injection commands: generate or write a blind secret, select it explicitly for one local command, and use it through local Runtime Injection without exposing the Sensitive Value to shell history, local files, CLI JSON, or an agent transcript. The Organization remains the tenant boundary, and the created User receives an owner Membership in that Personal Organization.

## Considered Options

- Instance Operator-created Organizations only. Rejected for the hosted solo-developer path: it preserves tight control, but makes the first user wait on an administrative step before seeing value.
- Guided Personal Organization Provisioning. Accepted: it keeps the Organization and Membership model intact while removing setup friction.
- Fully unrestricted Organization creation. Rejected for V1 because hostile-tenant, quota, tenant-enumeration, abuse, and Service Access controls must be ready before broad public signup.

## Consequences

Bounded Onboarding now means controlled Organization creation, not operator-mediated Organization creation for every hosted user. Public Onboarding may create a Personal Organization only when the Instance admits the user and the posture's abuse controls are active. The onboarding flow should avoid asking the user to name or configure unnecessary objects before value: default names and opaque IDs are acceptable, and renaming or inviting collaborators can happen later. Provider App Connections, Secret Syncs, Protected Environments, and production deploy workflows are follow-on setup after the provider-free First Value Proof. Personal Organizations grow into small-team Organizations through Invitations and Memberships; they are not a separate single-user product mode.
