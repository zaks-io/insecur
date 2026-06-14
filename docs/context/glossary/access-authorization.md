# Access And Authorization

Glossary slice for agents. Term definitions are authoritative here and single-sourced;
do not copy them into package context files. Index and routing: [`../../../CONTEXT.md`](../../../CONTEXT.md).
Term relationships: [`../relationships.md`](../relationships.md). Usage examples: [`../dialogue.md`](../dialogue.md).

## Access And Authorization

**Agent**:
An automated tool that acts through a user or machine identity.
_Avoid_: bot user, script when the authentication boundary is meant

**Membership**:
The assignment that binds one **User**, **Team**, or **Machine Identity** to one **Organization** or **Project** scope and grants **Organization Access** there.
_Avoid_: permission, grant, WorkOS membership when the authorization assignment is meant

**Effective Access**:
The final set of **Authorization Scopes** an actor holds for one requested organization, project, and environment, computed by the **Effective Access Resolver** and checked against the **Authorization Scope** an action requires. Effective Access is the source of truth for authorization decisions.
_Avoid_: permission when the evaluated result is meant, user-approved agent cancel not used for V1 authorization; record user/task/run correlation in audit, authorize by machine credential and Effective Access

**Effective Access Resolver**:
The single component that computes **Effective Access**. Both **User** actors (**Membership** plus **Role** expanded to scopes) and **Machine Identity** actors (**Credential Scopes**) resolve through it into one coordinate-bound **Authorization Scope** set; it is the only reader of the resource selectors that granted scopes carry, unions organization-tier and project-tier grants for the requested **Opaque Resource IDs**, decides only within one **Organization** and never across (that is **Service Access**), and stays protected-ignorant, leaving promotion approval to the **Protected Environment** regime above it.
_Avoid_: per-route access check, role check, the human bypass

**Authorization Scope**:
An atomic organization or project capability checked during **Organization Access** authorization.
_Avoid_: token scope when machine credential boundary is meant, permission when the named role bundle is meant, permission for an atomic organization or project capability (vs Role for the named bundle assigned through Membership)

**Scope-First Authorization**:
An authorization model where **Effective Access** **Authorization Scopes** are evaluated for decisions, while **Roles** are assignment presets that contribute scopes.
_Avoid_: role check when the code evaluates scopes

**Role**:
A named assignment bundle of **Authorization Scopes** used for **User** and **Team** access assignments.
_Avoid_: permission when referring to the named bundle, policy check when Effective Access scopes are evaluated, rule for an access bundle (vs Authorization Scope for an atomic capability)

**Built-In Role**:
A product-defined **Role** preset available without organization-specific role configuration.
_Avoid_: hard-coded permission, rule when access assignment is meant

**Approval Role**:
A **Built-In Role** preset whose **Authorization Scope** bundle authorizes protected-change approval and rejection without granting project or organization configuration authority or **Approval Request Cancellation** authority.
_Avoid_: approver permission when the Role is meant

**Metadata Viewer Role**:
A **Built-In Role** preset whose **Authorization Scope** bundle authorizes scoped metadata detail visibility without granting Sensitive Value access, Secret Delivery, configuration mutation, or approval authority.
_Avoid_: secret viewer, support role when the role is customer-scoped metadata visibility

**Organization Owner**:
A **User** with an owner **Role** **Membership** in one **Organization**.
_Avoid_: instance operator, admin when organization ownership is meant

**Credential Scopes**:
The explicit **Authorization Scopes** carried by a machine credential such as a **Machine Token** or short-lived access token issued to a **Machine Identity**.
_Avoid_: token scope when only the org/project/env boundary is meant, role when a machine credential is meant

**Team**:
A named collection of **Users** that may receive **Memberships** and **Roles** together.
_Avoid_: group, account when the Team object is meant, group for a reusable collection of Users that may share Memberships and Roles

**Default Team**:
The automatically created non-authorizing **Team** for one **Organization** used as the initial team assignment target in V1.
_Avoid_: everyone group, implicit permission, implicit membership when the Team object is meant
