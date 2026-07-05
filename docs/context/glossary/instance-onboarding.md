# Instance And Onboarding

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Instance And Onboarding

**Actor**:
A user or machine identity that can authenticate and attempt actions.
_Avoid_: account, principal

**Instance**:
The deployment boundary for one insecur installation, including global configuration, onboarding posture, and optional Service Access operators.
_Avoid_: deployment, environment when the whole product install is meant

**Hosted Instance**:
An Instance operated by insecur as a service, such as insecur.cloud.
_Avoid_: SaaS when the deployment boundary is meant

**Self-Hosted Instance**:
An Instance deployed into customer-controlled Cloudflare infrastructure using the same insecur runtime as a **Hosted Instance**.
_Avoid_: on-prem, separate product, rewrite when the deployment boundary is meant

**Local Mode**:
Account-less CLI operation where non-protected development Secrets are stored encrypted on the developer's own machine and used through the ordinary secret-write and Runtime Injection command surface, with no Hosted Instance account. Local Mode's claim is keeping development secrets out of casual agent reach (repo files, shell history, terminal output, agent transcripts); it is explicitly not no-reveal custody, because the local machine cannot enforce a boundary against processes running as the same user. Local Mode is single-seat and machine-scoped: Projects and non-protected development Environments exist locally with client-minted Opaque Resource IDs, while Organization, User, Team, Membership, Protected Environments, Secret Sync, machine access, and production delivery never exist in Local Mode.
_Avoid_: local vault, offline mode, free tier when the account-less workflow is meant, self-hosted when no Instance exists

**Small-Group Production**:
The near-term product posture for personal projects and relatively small trusted groups using insecur with production-quality secret protection.
_Avoid_: public multi-tenant production when broad public onboarding is not meant, dev-only mode

**First Value Milestone**:
The first V1 milestone where an admitted User reaches provider-free **Diskless Development Secret Use** in a non-protected development **Environment** through **Guided Organization Provisioning** and **First Value Proof**, using the real tenant, authorization, storage, key, Secret Version, audit, and Runtime Injection seams defined in `docs/first-value-milestone.md`.
_Avoid_: production-ready, unsafe mode, demo-only product

**Production Delivery Milestone**:
The V1 milestone where **Protected Environments**, production **Secret Delivery**, provider **Secret Sync**, machine access, approval, audit, runbook, and storage gates are ready for **Small-Group Production**.
_Avoid_: first-run, onboarding proof, dev loop

**Enterprise-Ready Model**:
A product model that preserves organization, membership, role, authorization, audit, and key boundaries so later enterprise support does not require a domain refactor.
_Avoid_: enterprise edition, custom policy engine when the model boundary is meant

**Bounded Onboarding**:
An onboarding posture where Organization creation is limited to Instance Operator action or controlled Guided Organization Provisioning, instead of unrestricted public tenant creation.
_Avoid_: open signup, unrestricted public onboarding

**Guided Organization Provisioning**:
A controlled Public Onboarding flow that automatically creates a Personal Organization, Default Team, owner Membership, first Project, and non-protected development Environment for a newly admitted User.
_Avoid_: first user wins, unrestricted organization creation, choose Automation-Friendly during onboarding; Guided Organization Provisioning applies Balanced automatically

**Instance Configuration**:
The non-secret settings that control an Instance, such as onboarding posture, identity settings, rate limits, feature availability, and instance-scoped webhook subscriptions.
_Avoid_: instance settings when the configured object is meant, rate limits at deployment scope, not organization quota unless the limit applies to one Organization only

**Instance Identity Configuration**:
The part of **Instance Configuration** that defines how **Users** authenticate to an Instance through a **Human Identity Provider**.
_Avoid_: organization login, tenant IdP when the whole Instance is meant, SSO at deployment scope unless per-Organization IdP is explicitly in scope

**Human Identity Provider**:
The external system configured through **Instance Identity Configuration** that authenticates **Users**.
_Avoid_: auth provider when **App Connection** provider authentication is meant, WorkOS when the provider boundary is meant

**External Subject**:
The stable **Human Identity Provider** identifier bound to one **User**.
_Avoid_: email, username when durable identity is meant

**Instance Operator**:
A User authorized to administer an Instance through **Instance Configuration** and **Organization** creation outside **Public Onboarding**.
_Avoid_: service access, organization owner when the whole Instance is meant

**Bootstrap Secret**:
A one-time secret that authorizes **Instance Bootstrap** before normal authentication exists.
_Avoid_: bootstrap token when consumption and rotation are the concern

**Bootstrap Operator Claim**:
A one-time pending assignment that grants the first **Instance Operator** only after a **Human Identity Provider**-authenticated **User** presents the **Bootstrap Secret**.
_Avoid_: first user wins, local admin user

**Instance Bootstrap**:
The one-time flow that creates an Instance, its Instance Configuration, first Organization, and Bootstrap Operator Claim.
_Avoid_: first login, setup wizard when the one-time initialization flow is meant

**Organization**:
The tenant boundary that owns projects, memberships, machine identities, app connections, and audit log entries inside one Instance.
_Avoid_: account, workspace, tenant when "organization" is meant, instance when the deployment boundary is meant

**Personal Organization**:
An Organization automatically created for one User during Guided Organization Provisioning, initially owned by that User and able to grow through Invitations and Memberships.
_Avoid_: personal account, single-user mode, workspace

**Organization Configuration**:
The non-secret settings that control one Organization within an Instance, such as approval policy, quotas, invitation restrictions, and organization-scoped webhook subscriptions.
_Avoid_: organization settings when the configured object is meant

**Webhook Subscription**:
A configured outbound delivery target with a selected event set that receives matching **Event Notifications**.
_Avoid_: webhook URL, callback when the managed subscription is meant, webhook for the configured outbound integration, not the destination URL alone

**Webhook Event Type**:
A named product event that may be selected when configuring a **Webhook Subscription**.
_Avoid_: audit action when the integrator-facing event name is meant

**Webhook Signing Secret**:
The shared secret used to HMAC-sign **Event Notifications** for one **Webhook Subscription**.
_Avoid_: webhook secret when rotation scope matters

**Webhook Signature**:
The HMAC over an **Event Notification** payload produced with the **Webhook Signing Secret**.
_Avoid_: signature header when the verification value is meant

**Event Notification**:
A metadata-safe outbound message delivered through a **Webhook Subscription**.
_Avoid_: webhook payload when the delivered message is meant

**User**:
A human actor who can receive access through memberships and is bound to one **External Subject**.
_Avoid_: account, member when referring to the person

**Organization Access**:
Access granted inside an organization or project through a membership and role.
_Avoid_: service access when the action is customer-scoped, SSO group, unless a future directory sync created a Team or Membership, provisioned user; authentication alone only resolves a User bound to an External Subject

**Service Access**:
Access granted to a User or Machine Identity to operate insecur across Organizations within a Hosted Instance for support, abuse response, incident investigation, and reliability.
_Avoid_: operator access, support access, platform user, instance operator when customer Instance administration is meant, when the action operates insecur across organizations

**Public Onboarding**:
The externally available flow where a user can enter insecur and create or join organizations.
_Avoid_: signup when the user and organization boundaries matter

**Signup Lockdown**:
A security state that restricts public onboarding while existing Organizations continue normal authenticated access.
_Avoid_: maintenance mode, invite pause

**Tenant Suspension**:
A security state that restricts an organization's high-risk actions while preserving evidence and limited owner remediation access.
_Avoid_: deletion, ban when the organization still exists, disable tenant when the organization still exists for evidence and remediation

**Invitation**:
A pending request for a user to receive exactly one organization- or project-scoped membership.
_Avoid_: signup link when membership is the target
