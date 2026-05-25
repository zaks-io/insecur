# ADR-0041: First Value Before Production Delivery

Date: 2026-05-25

Status: Accepted

V1 will be planned as two ordered milestones. The First Value Milestone gets an admitted user to a working provider-free secret flow in a non-protected development Environment: Guided Organization Provisioning, a Personal Organization, a first Project, a development Environment, a service-generated Blind Secret Write, and local Runtime Injection through the copyable First Value Proof. The Production Delivery Milestone follows with Protected Environments, production Secret Delivery, provider Secret Sync, machine access, OIDC, approvals, audit/export, runbooks, and the Storage Security Gate.

## Considered Options

- Treat all V1 production capabilities as one launch gate. Rejected because it makes tenant schema, WorkOS, key hierarchy, provider sync, approvals, machine identity, OIDC, audit, runbooks, and storage gates block the user's first useful moment.
- Split First Value from Production Delivery. Accepted because it preserves the production security standard while letting the product demonstrate immediate value without provider setup or production secrets.
- Ship an unsafe production shortcut. Rejected because it would undermine the core trust story and create migration debt around Sensitive Values.

## Consequences

The First Value Milestone is not a dev-only product direction or a supported unsafe mode. It is an onboarding and product-value milestone that must still use the real Organization, Project, Environment, Membership, Blind Secret Write, and Runtime Injection concepts. It is limited to non-protected development values and must not ask users to place production-grade Sensitive Values there.

The Production Delivery Milestone owns the full Small-Group Production readiness bar: Storage Security Gate, Protected Environment lifecycle, machine credentials and OIDC, provider App Connections and Secret Syncs, approvals and High-Assurance Challenges, tenant-bounded audit/export, security runbooks, and release-gate evidence.
