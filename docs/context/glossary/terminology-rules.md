# Terminology Disambiguation Rules

Cross-cutting naming rules that disambiguate between multiple terms ("X is
ambiguous between A, B, and C; use the precise term"). Load on demand when you
are choosing between competing terms, not defining one. Single-term naming
guidance lives on each term's `_Avoid_:` line in the [`glossary/`](.) slices,
indexed by [`../../../CONTEXT.md`](../../../CONTEXT.md).

- "account" is ambiguous between **User** and **Organization**; use the precise term.
- "tenant" should be written as **Organization** unless discussing multi-tenancy as a general property or the whole product install, when **Instance** may be meant.
- "signup" is ambiguous between **User** creation, **Organization** creation, and the full **Public Onboarding** flow; use the precise term.
- "operator" is ambiguous between **Instance Operator** and **Service Access**; use the precise term.
- "admin" is ambiguous between **Role**, **Instance Operator**, and **Service Access**; use the precise term.
- "scope" is ambiguous between **Authorization Scope**, **Credential Scopes**, and **Token Scope**; use the precise term.
- "user access" is ambiguous between **Organization Access** and **Service Access**; use the precise term.
- "credential" is overloaded; use **Auth Method**, **Machine Token**, **Connection Method**, or **App Connection** depending on the boundary.
- "secret group" is ambiguous; use **Runtime Injection Policy** when the saved set is for a command or workflow, and **Team** when the group is people.
- "integration" is ambiguous between **App Connection** and **Secret Sync**; use **App Connection** for provider authorization and **Secret Sync** for project-level push behavior.
- "secret name" is ambiguous; use **Variable Key** for the application-facing key such as `DATABASE_URL`, and **Display Name** only for a user-authored readability label.
- "name" is ambiguous; use **Display Name** for user-authored product labels and **Sensitive Metadata** for provider-side names, targets, notes, device routing, or security-relevant relationships.
- "key" is ambiguous; use **Variable Key** for application env-var keys, **Opaque Resource ID** for resource identity, **Runtime Policy Key** for the current runtime policy selector term, and cryptographic key terms for encryption material.
- "scoped lookup", "look up by name", and "find the X named Y" are ambiguous; use **Scoped List** for an authorized browse or filter and **Display Name Resolution** for resolving a name to exactly one **Opaque Resource ID** before acting.
- "plaintext access" is ambiguous between **Secret Delivery** and **Secret Reveal**; use **Secret Reveal** only when the caller receives the plaintext value.
- "keys" is ambiguous between **Secrets** and encryption keys; use **Secret** for application values and **Organization Data Key** or **Project Data Key** for encryption material.
- "bootstrap token" should be written as **Bootstrap Secret** when the one-time authorization secret is meant.
