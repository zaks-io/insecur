# Example Dialogue

Worked Q&A showing the domain vocabulary in use. Load on demand when you need usage
examples, not just definitions. Definitions: [`glossary/`](glossary/), indexed by
[`../../CONTEXT.md`](../../CONTEXT.md). Relationships: [`relationships.md`](relationships.md).

## Example Dialogue

> **Dev:** "Can we use the same GitHub connection for every project?"
> **Domain expert:** "The **App Connection** belongs to the **Organization**, but each **Secret Sync** belongs to a **Project** and decides which **Environment** and **Sync Target** it writes to."
>
> **Dev:** "Can a provider callback just attach whatever GitHub installation or Vercel team came back from OAuth?"
> **Domain expert:** "No. A **Provider Authorization Callback** must verify **Provider Account Linkage**, bind to the intended **Organization** and **Connection Boundary**, and re-check the initiating **User's** **Organization Access** before storing credentials."
>
> **Dev:** "If I roll back a **Secret**, do we point reads at the old version?"
> **Domain expert:** "No. A **Rollback** creates a new **Secret Version** from the older value and makes that new version the **Current Version**."
>
> **Dev:** "Does setting a production secret immediately affect deploys?"
> **Domain expert:** "No. In a **Protected Environment**, setting creates a **Draft Version**; only **Promotion** creates a **Published Version** eligible for delivery."
>
> **Dev:** "Can I flip an existing dev environment to protected once it's ready for production?"
> **Domain expert:** "No. An **Environment**'s protected status is fixed at creation. Create a new **Protected Environment** and migrate the **Secret Shapes**; there is no in-place protect/unprotect toggle."
>
> **Dev:** "Can a Secret hold a JSON blob with several fields?"
> **Domain expert:** "Not in V1. A **Secret** value is a **Text Secret Value**: one valid UTF-8 string. Structured values are a deferred additive type, so model multiple fields as separate **Secrets** for now."
>
> **Dev:** "Where is the actual key-value store?"
> **Domain expert:** "Inside each **Environment**. A **Secret Shape** defines the **Variable Key** such as `DATABASE_URL`; that Environment's **Secret** points to the selected **Secret Version** whose **Sensitive Value** is delivered. Runtime injection turns that into `DATABASE_URL=<value>` for the child process."
>
> **Dev:** "Can I bulk-load my local `.env` to get started?"
> **Domain expert:** "Yes, through **Local Secret File Migration** using client-side **Secret Import** over a **Safe Sensitive Input Path**: it parses the file locally and does one **Blind Secret Write** per **Variable Key**. That is import, not **Secret Sync**, and insecur never reads values back from a provider to populate itself."
>
> **Dev:** "If one `.env` key is invalid, do we import the rest?"
> **Domain expert:** "No. **Import Preflight** validates the whole file before any **Blind Secret Writes**. Errors may show invalid **Variable Keys** and line numbers, but never values."
>
> **Dev:** "If the same `.env` key appears twice, should import use the last one?"
> **Domain expert:** "No. Duplicate final **Variable Keys** fail **Import Preflight**. The user should clean up the file so there is exactly one intended value for each key."
>
> **Dev:** "Can I preview what `.env` import will do before values move?"
> **Domain expert:** "Yes. Produce a **Secret Import Plan** from **Import Preflight**: target scope, final **Variable Keys**, planned **Secret Shape** creates or matches, planned **Secret** creates, and any invalid or duplicate final keys. It must not show **Sensitive Values** or raw file contents."
>
> **Dev:** "If I import with `--variable-key-prefix LOCAL_`, do we validate `DATABASE_URL` or `LOCAL_DATABASE_URL`?"
> **Domain expert:** "Validate the final **Variable Key**. Apply the **Variable Key Prefix** first, then **Import Preflight** validates and de-duplicates the final keys. The prefix cannot normalize or fix parsed keys unless the final key itself is valid."
>
> **Dev:** "If `.env` contains a key that already exists in the target Environment, should import update it?"
> **Domain expert:** "No. **Local Secret File Migration** is create-only. Existing final **Variable Keys** produce **Import Existing Secret Conflicts** and no writes happen. Change existing **Secrets** with normal secret-write or rotation workflows, not by reloading a local file."
>
> **Dev:** "Should `.env` import automatically create a Runtime Injection Policy from the imported keys?"
> **Domain expert:** "No. **Secret Import Delivery Separation** is strict: import migrates values into non-protected development **Secrets** only. It must never create, change, or bind **Runtime Injection Policies**."
>
> **Dev:** "Can I import a `.env` file into production or another Protected Environment?"
> **Domain expert:** "No. **Local Secret File Migration** is only for non-protected development **Environments**. Protected values enter through protected secret-write, generation, draft, **Promotion**, and rollback workflows."
>
> **Dev:** "Can I run `secrets set --value-file ./secret.txt`?"
> **Domain expert:** "No. Ordinary **Secret** writes must not accept named local file inputs. Use `--value-stdin`, a masked prompt, service generation, request body, or provider authorization flow. **Local Secret File Migration** is the only V1 local-file ingress path, and only for non-protected development adoption."
>
> **Dev:** "If I run `secrets set` in my terminal without `--generate` or `--value-stdin`, what happens?"
> **Domain expert:** "In a human TTY, the CLI uses a **Masked Secret Prompt**. In non-interactive mode, it fails with `secret.input_required` and tells the caller to choose service generation or stdin input."
>
> **Dev:** "Does `--value-stdin` trim the newline from `echo secret`?"
> **Domain expert:** "No. Stdin uses **Exact Stdin Value Input**. If the caller sends a trailing newline or multiline value, that is the **Sensitive Value**. Use a no-newline producer such as `printf %s` when no newline is intended."
>
> **Dev:** "Can I store an empty secret value?"
> **Domain expert:** "Yes, but only as an **Explicit Empty Value Write**. Empty stdin, a blank masked prompt, or an empty imported value fails by default with `secret.empty_value`; the caller must explicitly allow a zero-length value."
>
> **Dev:** "Can I pipe arbitrary binary bytes into `--value-stdin`?"
> **Domain expert:** "No. V1 **Secret** values are **Text Secret Values**. Invalid UTF-8 fails with `secret.invalid_encoding`; if a binary credential is needed, encode it before writing and store the encoded text intentionally."
>
> **Dev:** "Is the Secret value size limit counted in characters or bytes?"
> **Domain expert:** "Bytes. The V1 **Secret Value Size Limit** is 64 KiB encoded UTF-8 bytes after validation. If the value exceeds the limit, the write fails with `secret.value_too_large` before any **Secret Version** is created."
>
> **Dev:** "Does the 64 KiB storage limit fit every provider sync target?"
> **Domain expert:** "No. 64 KiB is insecur's storage limit, not a provider compatibility promise. **Secret Sync** must validate the destination **Provider Value Size Limit** and fail with `sync.provider_value_too_large` before provider write when a stored value is too large for that target."
>
> **Dev:** "If one sync binding is too large for the provider, do the other bindings still write?"
> **Domain expert:** "No. That hits the **All-Or-Nothing Sync Pre-Write Gate**: `sync.provider_value_too_large` blocks the whole run before any provider write starts."
>
> **Dev:** "Should the too-large error show the exact value length?"
> **Domain expert:** "Only in authorized full-fidelity plan, status, approval, or security-review surfaces. For **Protected Environment** **Secrets**, exact **Value Length Metadata** is **Sensitive Metadata** and requires **Sensitive Detail Gate**. Low-detail and **Agent-Reachable Channel** output shows `over_limit`, provider cap, destination type, and opaque IDs."
>
> **Dev:** "Should insecur auto-compress, truncate, chunk, or encode a too-large value for provider sync?"
> **Domain expert:** "No. That would be **Automatic Provider Value Transform** and would change application semantics. Fail with `sync.provider_value_too_large`; the User must explicitly choose **Runtime Injection**, a smaller value, provider-supported external storage, or caller-managed encoded text."
>
> **Dev:** "Can protected Promotion publish a value that an already-enabled sync cannot deliver because of a provider cap?"
> **Domain expert:** "No. The **Approval Impact Review** includes **Protected Promotion Sync Preflight**. `sync.provider_value_too_large` blocks **Promotion** before any **Published Version** change or **Immediate Sync After Promotion** enqueue."
>
> **Dev:** "Should import rewrite or delete the `.env` after the values are migrated?"
> **Domain expert:** "No. **Local Secret File Migration** leaves the file unchanged. If the user wants cleanup, they run a separate **Local Secret File Removal** command with explicit confirmation."
>
> **Dev:** "Can I export the secrets back to `.env` for a legacy local tool?"
> **Domain expert:** "No. V1 supports migration from **Local Secret Files**, not writing **Local Secret Files**. Use **Runtime Injection** for local commands."
>
> **Dev:** "If we sync a production secret to Cloudflare, is that just updating metadata?"
> **Domain expert:** "No. A `cloudflare` **Secret Sync** writes a **Cloudflare Worker Secret** on an exact **Cloudflare Worker Script**, and that creates **Cloudflare Worker Secret Deploy** impact for that script."
>
> **Dev:** "Do we keep plaintext copies for emergency rollback?"
> **Domain expert:** "No. The **Rollback Retention Window** keeps encrypted prior **Published Versions** eligible for **Rollback**."
>
> **Dev:** "Can an agent pull production secrets to stdout?"
> **Domain expert:** "No. Prefer **Runtime Injection** for local commands and **Secret Sync** for provider destinations; **Secret Reveal** is a separate high-risk path."
>
> **Dev:** "Can an agent access the secret?"
> **Domain expert:** "Use **Secret Use** if the agent can trigger delivery, and **Secret Reveal** only if the agent receives the plaintext value."
>
> **Dev:** "Can dev inherit production defaults?"
> **Domain expert:** "Dev may copy the **Secret Shape**, but never the protected **Secret** value; use an **Environment Default** set specifically for dev."
>
> **Dev:** "What if one value really is shared across environments?"
> **Domain expert:** "Use a **Shared Secret Source** with explicit environment attachments, not environment inheritance or value copying."
>
> **Dev:** "Can the agent edit `.insecur.json` to change which command gets production secrets?"
> **Domain expert:** "No. `.insecur.json` is only a hint; a server-owned **Runtime Injection Policy** issues an **Injection Grant** only for an approved **Command Fingerprint**."
>
> **Dev:** "Can the system stop an approved child process from leaking its own environment?"
> **Domain expert:** "No. That is the **Runtime Trust Boundary**; the product minimizes accidental exposure before that point and audits delivery."
>
> **Dev:** "Where do webhooks live?"
> **Domain expert:** "Both layers. **Instance Configuration** can have instance-scoped **Webhook Subscriptions** for deployment-wide events like signup lockdown or instance health. **Organization Configuration** can have organization-scoped **Webhook Subscriptions** for tenant events like approvals, secret lifecycle changes, and sync completion."
>
> **Dev:** "How does the receiver verify a webhook?"
> **Domain expert:** "Each **Webhook Subscription** has a **Webhook Signing Secret**. Every **Event Notification** includes a timestamp and **Webhook Signature** produced with HMAC over the payload. The receiver verifies the signature before acting."
>
> **Dev:** "Do webhooks fire for every audit event?"
> **Domain expert:** "No. A **Webhook Subscription** includes selected **Webhook Event Types**. The subscriber chooses which events to receive when configuring the subscription. Anything webhook-worthy is still audited, but not every **Audit Log** entry generates an **Event Notification**."
>
> **Dev:** "Can a webhook include the approval note or provider target name?"
> **Domain expert:** "No. **Event Notifications** are metadata-safe tracking alerts. They exclude **Sensitive Values** and **Sensitive Metadata**, but can say that an approval completed or a sync finished successfully using opaque IDs, **Display Names**, stable event codes, and result status."
>
> **Dev:** "Can each organization bring its own SSO provider?"
> **Domain expert:** "Identity is **Instance Identity Configuration** today. **Users** authenticate to the **Instance**, then receive **Organization Access** through **Memberships**. **Organization**-scoped identity can be added later without moving secret governance out of **Organization Configuration**."
>
> **Dev:** "Why do we need memberships?"
> **Domain expert:** "Because login only answers who someone is. A **Membership** answers where they may act — which **Organization** or **Project** — and, for **Users** and **Teams**, which **Roles** apply there. It is the assignment record, not WorkOS org membership."
>
> **Dev:** "Do deploy keys get the admin role?"
> **Domain expert:** "No. **Environment Deploy Keys** get a tight **Token Scope** for one org/project/env and **Credential Scopes** such as `runtime.inject` only. The **Machine Identity** is the actor; the deploy key is an **Auth Method** for that actor."
>
> **Dev:** "Are roles just hard-coded strings?"
> **Domain expert:** "No. **Authorization Scopes** are the source of truth. V1 exposes **Built-In Roles** only: owner, admin, developer, metadata viewer, approval, and read-only. Each **Built-In Role** is a preset **Authorization Scope** bundle, so custom **Roles** or explicit scope assignments can be added later without changing authorization checks."
>
> **Dev:** "Can I make a developer an approver without letting them edit project configuration?"
> **Domain expert:** "Yes. Assign the **Approval Role** separately from developer/admin. Behind the scenes, approval checks look for approval **Authorization Scopes** in **Effective Access**; the **Approval Role** contributes those scopes without contributing project configuration, **App Connection**, **Secret Sync** configuration, **Runtime Injection Policy**, or membership management scopes."
>
> **Dev:** "Does an owner also need the Approval Role?"
> **Domain expert:** "No. The owner **Built-In Role** includes approval **Authorization Scopes** so solo-owner operation works. Admin and developer do not include approval scopes; use the **Approval Role** when a non-owner should approve."
>
> **Dev:** "Can someone approve Project A without being able to approve Project B?"
> **Domain expert:** "Yes. Give them project-scoped approval **Authorization Scopes** for Project A. Approval checks evaluate **Effective Access** for the **Project** and **Protected Environment** affected by the **Approval Request**."
>
> **Dev:** "Can the requester approve their own production change?"
> **Domain expert:** "Only when the **Protected Approval Policy** requires one approval. The requester still needs approval **Authorization Scopes** and a **High-Assurance Challenge**. When the policy requires multiple approvals, **Requester Self-Approval** is denied."
>
> **Dev:** "Can one person count twice if they have approval through two Teams?"
> **Domain expert:** "No. Multi-approval policy counts **Distinct Approvers**. Teams and overlapping **Memberships** can grant approval scopes, but the approval actor is one concrete **User** and counts once."
>
> **Dev:** "Can an approver reject instead of approve?"
> **Domain expert:** "Yes. **Approval Request Rejection** uses the same approval **Authorization Scopes** and **High-Assurance Challenge** as approval. It closes the request without **Promotion** and leaves **Draft Versions** available for a later request."
>
> **Dev:** "Does rejection need a reason?"
> **Domain expert:** "No. V1 supports an optional **Approval Rejection Note**. It is **Sensitive Metadata**, handled like **Approval Context Note** text, and not required by the default **Protected Approval Policy**."
>
> **Dev:** "Can the requester cancel a pending approval request without MFA?"
> **Domain expert:** "Yes. **Approval Request Cancellation** only closes a pending request and cannot promote or expand delivery. The requester can cancel their own pending request with a normal authenticated session; scoped owners/admins can cancel pending requests for cleanup."
>
> **Dev:** "Can a request be canceled after one approver already approved it?"
> **Domain expert:** "Yes, while the **Approval Request** is still pending. **Partial Approvals** are tied to that exact request and **Promotion Change Set**; cancellation preserves them in audit history but they cannot be reused for any later request."
>
> **Dev:** "Can an Agent undo the Approval Request it created?"
> **Domain expert:** "Yes, when the request was created by a **Machine Identity** and is still pending. The same **Machine Identity** can perform **Approval Request Cancellation** with a currently valid machine credential and matching **Effective Access**, but it cannot cancel requests created by **Users** or other **Machine Identities**."
>
> **Dev:** "Can the Agent still cancel after a human already approved?"
> **Domain expert:** "Yes, while the request is still pending. A requesting **Machine Identity** can cancel its own pending **Approval Request** after human **Partial Approvals** exist; cancellation preserves those approvals in audit history, invalidates them for delivery and future requests, and does not satisfy the **Protected Approval Policy**."
>
> **Dev:** "Does the Agent need a stored user instruction before canceling?"
> **Domain expert:** "No. The current machine credential and matching **Effective Access** authorize own-request cancellation. If the cancellation came from a **User** instruction, task, or **Agent** run, record that correlation in audit history, but absence of that context does not block V1 cancellation."
>
> **Dev:** "Can an approval-only user cancel instead of rejecting?"
> **Domain expert:** "No. Approval **Authorization Scopes** authorize approval and **Approval Request Rejection**, not **Approval Request Cancellation**. Unless that **User** is the requester or has scoped owner/admin cleanup authority, they reject with a **High-Assurance Challenge**."
>
> **Dev:** "Can Okta group membership automatically make someone a production admin?"
> **Domain expert:** "Not by default. The **Human Identity Provider** decides who may authenticate; insecur decides **Organization Access** through **Teams**, **Memberships**, and **Roles**. Directory or SCIM sync may create **Teams** or **Memberships** later, but authorization still lives in insecur."
>
> **Dev:** "Who decides whether someone can log in?"
> **Domain expert:** "**Instance Identity Configuration** points at a **Human Identity Provider** such as WorkOS AuthKit or Okta. Admission is configured there. insecur creates or resolves a **User** from the **External Subject** on login, but **Organization Access** still comes from **Memberships**."
>
> **Dev:** "How does a self-hosted install get its first user and organization?"
> **Domain expert:** "Through **Instance Bootstrap** and **Bootstrap Operator Claim** completion. Bootstrap configures the **Human Identity Provider**, creates the **Instance**, **Instance Configuration**, first **Organization**, and a pending claim. The first **Instance Operator** is created only when a **Human Identity Provider**-authenticated **User** also presents the **Bootstrap Secret**."
>
> **Dev:** "Does a solo hosted user need someone to create an organization before they can try the product?"
> **Domain expert:** "No. **Guided Organization Provisioning** creates a **Personal Organization**, **Default Team**, owner **Membership**, first **Project**, and non-protected development **Environment** for an admitted **User**, while growth still happens through **Invitations** and **Memberships**."
>
> **Dev:** "Can the first-run demo prove the agent never reads the value?"
> **Domain expert:** "No. A **First Value Proof** proves **Diskless Development Secret Use** for the caller and output path: a service-generated **Blind Secret Write** is consumed through **Runtime Injection** using ordinary CLI commands and returns metadata-only success or failure. After the **Runtime Trust Boundary**, an arbitrary child process can read the development value it was intentionally given."
>
> **Dev:** "Should First Value Proof be a special onboarding command?"
> **Domain expert:** "No. It should use the real **Blind Secret Write** and **Runtime Injection** commands so the first success demonstrates the actual product surface."
>
> **Dev:** "Can a policy let agents deploy preview environments from the CLI?"
> **Domain expert:** "Yes, a **Delivery Risk Policy** may allow configured non-protected preview or development delivery through **Agent-Reachable Channels**. Protected production approval still routes through the **Human Approval Surface**."
>
> **Dev:** "Can an organization configure production approval to be terminal-only?"
> **Domain expert:** "No, not in V1. An **Agent-Reachable Channel** may request and poll the operation, but **Protected Environment** approval and **High-Assurance Challenge** completion happen through the **Human Approval Surface**."
>
> **Dev:** "Should users configure delivery risk through a custom policy editor in V1?"
> **Domain expert:** "No. V1 exposes **Delivery Risk Policy Presets** backed by versioned **Delivery Risk Policy** templates. Users see Strict, Balanced, and Automation-Friendly, while the system stores auditable policy infrastructure for future enterprise controls."
>
> **Dev:** "Which preset does onboarding apply?"
> **Domain expert:** "**Guided Organization Provisioning** applies the Balanced **Delivery Risk Policy Preset** by default so first use stays low-friction without making protected production gates agent-clearable."
>
> **Dev:** "Can onboarding offer Automation-Friendly for advanced users?"
> **Domain expert:** "No. First onboarding does not show a **Delivery Risk Policy Preset** picker. It applies Balanced automatically; selecting Automation-Friendly later is a **Risk-Broadening Delivery Change** through the **Human Approval Surface**."
>
> **Dev:** "Can an agent switch the organization from Strict to Automation-Friendly?"
> **Domain expert:** "No. That is a **Risk-Broadening Delivery Change**. An **Agent-Reachable Channel** may request or poll it, but an authorized **User** must complete it through the **Human Approval Surface** with a **High-Assurance Challenge**."
>
> **Dev:** "Can a user tighten the preset without step-up?"
> **Domain expert:** "Yes. A **Risk-Tightening Delivery Change** may be completed by an authorized **User** in the authenticated web app without a **High-Assurance Challenge**, but it is still audited and not terminal-only in V1."
>
> **Dev:** "In Balanced, can agents deploy every preview environment by default?"
> **Domain expert:** "No. Balanced allows non-protected development automation by default, but preview delivery requires a **Preview Automation Opt-In** on each non-protected preview **Environment**."
>
> **Dev:** "After Preview Automation Opt-In, can the agent add a new preview sync target or secret?"
> **Domain expert:** "No. **Preview Automation Authority** is execution-only for already-configured **Runtime Injection Policies**, **Secret Syncs**, and **Secret Sync Bindings**. Adding provider targets, changing bindings, changing **Runtime Injection Policies**, or expanding the delivered **Secret** set is a separate **Risk-Broadening Delivery Change**."
>
> **Dev:** "Does Automation-Friendly let agents configure preview delivery?"
> **Domain expert:** "No. Automation-Friendly grants the same execution-only **Preview Automation Authority** by default for non-protected preview **Environments** in scope. It removes the per-environment opt-in step; it does not let agents create **App Connections**, add **Secret Sync Bindings**, change **Runtime Injection Policies**, or expand the delivered **Secret** set."
>
> **Dev:** "Does self-hosting mean a different product or rewrite?"
> **Domain expert:** "No. A **Self-Hosted Instance** uses the same insecur runtime as a **Hosted Instance**, deployed into customer-controlled Cloudflare infrastructure. The customer holds **Instance Operator** and controls **Instance Configuration**."
>
> **Dev:** "Is hosted different from self-hosted in the product model?"
> **Domain expert:** "No. Both use the same **Instance** shape. On a **Hosted Instance**, customers mostly work at the **Organization** layer and **Instance Operator** defaults to insecur. On a **Self-Hosted Instance**, the customer holds **Instance Operator** and controls **Instance Configuration**."
>
> **Dev:** "Who configures rate limits on a self-hosted install?"
> **Domain expert:** "The **Instance Operator** through **Instance Configuration**. A **Self-Hosted Instance** is not capped by insecur rate-limit policy unless the customer chooses to configure limits."
>
> **Dev:** "Is that the same as Service Access?"
> **Domain expert:** "No. **Service Access** is insecur platform operations on a **Hosted Instance** — abuse response, investigation, signup lockdown. **Instance Operator** is customer-side administration of one **Instance**, including **Instance Configuration** and creating **Organizations** when **Public Onboarding** is off."
>
> **Dev:** "Can a self-hosted customer run more than one organization?"
> **Domain expert:** "Yes. A **Self-Hosted Instance** can contain one or many **Organizations**. Bootstrap creates the first one; the customer decides whether to add more."
>
> **Dev:** "Is self-hosting a different product?"
> **Domain expert:** "No. A **Self-Hosted Instance** is the same insecur installation model as a **Hosted Instance**. The customer operates the **Instance**; **Organizations** inside it still own the secrets boundary."
>
> **Dev:** "If public signups get abused, do we shut down existing tenants?"
> **Domain expert:** "No. Use **Signup Lockdown** to restrict **Public Onboarding** and unauthenticated **Invitation** acceptance while existing **Users** and **Organizations** continue through normal authentication and authorization."
>
> **Dev:** "If one organization is abusing sync jobs, do we delete it?"
> **Domain expert:** "No. Use **Tenant Suspension** to contain high-risk actions while preserving **Audit Log** evidence and a limited remediation path."
>
> **Dev:** "Can support inspect the secret to debug a failed sync?"
> **Domain expert:** "No. **Service Access** can decrypt **Sensitive Metadata** such as target names, but it must not reveal **Sensitive Values**."
>
> **Dev:** "Can break-glass show a production secret to an organization owner?"
> **Domain expert:** "No. If it is a **Protected Environment**, break-glass can recover service through **Secret Delivery**, replacement, reauthorization, or **Rollback**, but not **Secret Reveal**."
>
> **Dev:** "Can sync verification compare the provider's stored secret value against insecur?"
> **Domain expert:** "No. **Secret Sync** verification checks provider metadata and status only; it does not perform **Provider Readback**."
>
> **Dev:** "If sync planning already checked the provider target, can execution just decrypt and write later?"
> **Domain expert:** "No. Every **Secret Sync** run performs **Sync Execution Revalidation** immediately before decrypting **Sensitive Values**. **Provider Drift** returns `sync.provider_drift` and writes nothing."
>
> **Dev:** "If a provider secret already exists, can we import it?"
> **Domain expert:** "Only if the **Sensitive Value** enters through a **Safe Sensitive Input Path**. V1 does not read provider-side **Sensitive Values**. If the destination is already set, **Explicit Provider Lookup** produces a **Provider Overwrite Warning** for the exact **Secret Sync Binding**."
>
> **Dev:** "If a provider already has a value for a synced variable, do we preserve it?"
> **Domain expert:** "No. A **Secret Sync** is authoritative for exact **Secret Sync Bindings**. Once the **User** approves those bindings, sync performs **Provider Sync Overwrite** without reading the old provider-side value."
>
> **Dev:** "Can insecur list all provider variables so I can choose which ones to sync?"
> **Domain expert:** "No. That turns insecur into a provider inventory disclosure path. **Explicit Provider Lookup** only checks exact configured **Secret Sync Binding** destinations inside bounded setup, planning, or approval operations."
>
> **Dev:** "So when I configure a sync, can insecur check whether that exact provider variable already exists?"
> **Domain expert:** "Yes. **Explicit Provider Lookup** can check the exact **Secret Sync Binding** destination and produce a **Provider Overwrite Warning**. It still does not list nearby provider variables or read the existing provider-side **Sensitive Value**."
>
> **Dev:** "If the provider lookup is down during protected sync setup, can I approve anyway?"
> **Domain expert:** "No. **Protected Environment** setup, approval, enablement, and manual run fail closed with `provider.unavailable` until every exact **Secret Sync Binding** has a completed **Explicit Provider Lookup** status."
>
> **Dev:** "If the provider lookup is down during non-protected sync setup, does it also fail closed?"
> **Domain expert:** "No. Non-protected sync setup, enablement, and manual run may continue only after a user-visible warning, explicit confirmation for that operation, and an audit event. The **User** must see that overwrite status is unknown and a provider-side value may be replaced."
>
> **Dev:** "Can a generic yes-to-all confirmation acknowledge unknown provider overwrite?"
> **Domain expert:** "No. Generic confirmation, stored defaults, previous confirmation, or unrelated approval do not count. The confirmation must be for that operation."
>
> **Dev:** "If an exact provider lookup fails, can we show the provider's error message so the User knows why?"
> **Domain expert:** "No. Return a **Provider Lookup Status** such as `provider.lookup_not_found` or `provider.permission_denied`. Provider-native error text and raw provider bodies stay out of UI, CLI, logs, audit, and operation records."
>
> **Dev:** "Are provider variable names returned by exact lookup safe to log or index?"
> **Domain expert:** "No. Provider-side secret and variable names used by **Explicit Provider Lookup** are **Sensitive Metadata**. Show decrypted provider metadata only through authorized setup, plan, or approval views after **Sensitive Detail Gate**."
>
> **Dev:** "Can we keep a reveal command for emergencies but hide it behind a scary flag?"
> **Domain expert:** "No. **Misuse-Resistant Defaults** mean Protected Environment reveal paths are absent, not merely discouraged."
>
> **Dev:** "Can CI change the production runtime policy if it has a machine identity?"
> **Domain expert:** "No. A **Machine Identity** can use an exact pre-authorized policy, but protected policy changes require a **High-Assurance Challenge** from a **User**."
>
> **Dev:** "Can an agent create a production admin key without seeing it?"
> **Domain expert:** "Yes. Use a service-generated **Blind Secret Write** to create a **Draft Version**, then have the agent request **Promotion**. The **User** approves that request once."
>
> **Dev:** "After approval, do production provider secrets wait for another command?"
> **Domain expert:** "No, after **Protected Promotion Sync Preflight** passes. **Immediate Sync After Promotion** enqueues every enabled **Secret Sync** affected by any promoted version."
>
> **Dev:** "Can an agent ask to promote everything it staged?"
> **Domain expert:** "No. It must create a **Promotion Change Set** with exact **Draft Versions** in one **Protected Environment**."
>
> **Dev:** "Does an approval request expire if nobody reviews it quickly?"
> **Domain expert:** "No. An **Approval Request** does not expire by age in V1. It stays pending until it is approved, rejected, canceled, superseded by a newer request for the same **Protected Environment**, made policy-stale by a **Protected Approval Policy** change, made requester-access-stale by **Requester Access Staleness**, or closed because one of its **Draft Versions** was discarded."
>
> **Dev:** "If the agent keeps editing after asking for approval, should approval be blocked?"
> **Domain expert:** "No. Warn that newer **Draft Versions** exist. If those should go live too, request **Promotion** again, which performs **Approval Request Supersession** for the prior pending request in that **Protected Environment**."
>
> **Dev:** "Does approval freeze the sync destinations the human saw?"
> **Domain expert:** "No. The **Promotion Change Set** freezes only **Draft Version** identity. The **Approval Impact Review** must be recomputed before approval, and stale approval screens require fresh review."
>
> **Dev:** "After approval, how do we know what delivery impact the approver acted on?"
> **Domain expert:** "Persist an **Approval Impact Snapshot** from the accepted **Approval Impact Review** that caused **Promotion**. For rejected, canceled, superseded, policy-stale, requester-access-stale, or draft-discard-closed requests, show immutable request facts and optionally a clearly labeled **Current Impact Preview**, but do not treat recomputed impact as historical approval evidence."
>
> **Dev:** "If sync impact changes after the first of two approvals, does the first approval still count?"
> **Domain expert:** "No. A **Partial Approval** records the **Approval Impact Review Fingerprint** it approved. If the current impact fingerprint changes before the **Protected Approval Policy** is satisfied, old **Partial Approvals** stay in audit history but become audit-only and must be re-collected against the fresh **Approval Impact Review**."
>
> **Dev:** "If an approver loses access after giving the first approval, does that approval still count?"
> **Domain expert:** "No. Before a **Partial Approval** counts toward the threshold, **Approver Access Revalidation** confirms the approving **User** is still active and currently has approval **Authorization Scopes** for the affected **Project** and **Protected Environment**. If not, the **Partial Approval** stays in audit history but becomes audit-only."
>
> **Dev:** "If that approver gets access back before approval finishes, does the old approval count again?"
> **Domain expert:** "No. Once failed **Approver Access Revalidation** makes a **Partial Approval** audit-only, that record stays audit-only. The **User** can approve again only with current **Effective Access**, a fresh **Approval Impact Review**, and a new **High-Assurance Challenge**."
>
> **Dev:** "If the requester loses access while the approval request is pending, can approvers still approve it?"
> **Domain expert:** "No. **Requester Access Staleness** closes the pending **Approval Request** without **Promotion**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and a currently authorized **User** or **Machine Identity** can create a fresh **Approval Request** if the change is still wanted."
>
> **Dev:** "If the agent's short-lived token expires while its approval request is pending, does the request become stale?"
> **Domain expert:** "No. Short-lived machine credential expiry alone does not cause **Requester Access Staleness**. For a **Machine Identity** request, staleness comes from durable authority changes such as disabled **Machine Identity**, removed **Membership** or approval-relevant **Authorization Scopes**, **Tenant Suspension**, or revoked/disabled **Auth Method**."
>
> **Dev:** "If the deploy key rotates while the agent's approval request is pending, does the request become stale?"
> **Domain expert:** "No, not for normal **Environment Deploy Key** rotation that preserves the same active **Auth Method**. **Requester Access Staleness** applies only when rotation is a compromise response that revokes, disables, or marks untrusted the **Auth Method** used for that pending request."
>
> **Dev:** "If the requester regains access after requester-access staleness, does the old request become approvable again?"
> **Domain expert:** "No. **Requester Access Staleness** is terminal for that **Approval Request**. The requester can create a fresh **Approval Request** with current authority and a fresh **Approval Impact Review**, but the stale request remains audit-only."
>
> **Dev:** "If the organization is suspended while approvals are pending, do they resume after reinstatement?"
> **Domain expert:** "No. **Tenant Suspension** performs **Requester Access Staleness** for pending **Approval Requests** in that **Organization**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and fresh **Approval Requests** are required after reinstatement."
>
> **Dev:** "If the project or protected environment is archived while approval is pending, can the old request be approved later?"
> **Domain expert:** "No. If the affected **Project** or **Protected Environment** no longer accepts protected **Promotion**, the pending **Approval Request** closes without **Promotion**. It preserves audit history, existing **Partial Approvals** become audit-only, and restoration or recreation requires a fresh **Approval Request**."
>
> **Dev:** "Can a fresh approval request reuse the same staged secret versions?"
> **Domain expert:** "Yes, use **Draft Version Reuse** when the **Draft Versions** still exist in the **Draft Area** and the target still accepts protected **Promotion**. The fresh request gets a new **Promotion Change Set**, new **Approval Impact Review**, and fresh approvals; the old request and **Partial Approvals** stay audit-only."
>
> **Dev:** "Can I clean up a staged secret version that will never be promoted?"
> **Domain expert:** "Yes. Use **Draft Version Discard**. The requester can discard their own unpromoted **Draft Version**, and scoped owner/admin users can discard for cleanup. It is audited, reveals no **Sensitive Values**, does not require approval, and any pending **Approval Request** containing that **Draft Version** closes without **Promotion**."
>
> **Dev:** "Can I undo a draft discard if I made a mistake?"
> **Domain expert:** "No. **Draft Version Discard** is terminal for that **Draft Version**. If the same **Sensitive Value** is still wanted, create a new **Blind Secret Write** and a new **Draft Version**, then request **Promotion** again if the target is protected."
>
> **Dev:** "Do we keep the discarded draft's encrypted value for retention?"
> **Domain expert:** "No. V1 **Draft Version Discard** crypto-erases the encrypted **Sensitive Value** material immediately and keeps only tombstone/audit metadata. Closed approval views can show immutable metadata, but the discarded value cannot be recovered."
>
> **Dev:** "Does discarding a draft need MFA or approval?"
> **Domain expert:** "No. It needs **Destructive Confirmation**, not a **High-Assurance Challenge** or **Approval Request**. Human UI and CLI flows require explicit discard confirmation; API and **Machine Identity** flows must name exact **Draft Version** IDs and are idempotent."
>
> **Dev:** "If discarding a draft closes a pending approval request, should the confirmation say that?"
> **Domain expert:** "Yes. Human **Destructive Confirmation** shows metadata-only impact: exact **Draft Version** IDs, affected **Approval Request** IDs, that **Partial Approvals** become audit-only, and that encrypted **Sensitive Value** material will be crypto-erased. It must not show **Sensitive Values** or decrypted **Sensitive Metadata**."
>
> **Dev:** "If I confirm discard, can the server still execute later after the pending request set changes?"
> **Domain expert:** "No. The service binds **Destructive Confirmation** to the computed metadata-only **Draft Version Discard** impact and revalidates immediately before execution. If a selected **Draft Version** was promoted, already discarded, removed from the actor's scope, or affects a different pending **Approval Request** set, UI/CLI must show refreshed impact and require fresh confirmation."
>
> **Dev:** "If approval policy changes while a request is pending, does the request use the old or new policy?"
> **Domain expert:** "Neither. **Approval Policy Staleness** closes the pending request without **Promotion**. Existing **Partial Approvals** become audit-only, **Draft Versions** stay in the **Draft Area**, and the requester creates a fresh **Approval Request** under the new **Protected Approval Policy**."
>
> **Dev:** "Does changing the approval policy create its own approval request?"
> **Domain expert:** "Not in V1. A **Protected Approval Policy Change** is a high-assurance configuration mutation that requires owner/admin configuration **Authorization Scopes** and a **High-Assurance Challenge**. It is audited heavily and makes affected pending requests policy-stale; future enterprise support may add a separate approval purpose for policy changes."
>
> **Dev:** "Can the agent explain why it is asking for approval?"
> **Domain expert:** "Yes, as an **Approval Context Note**. It is useful context, but the approval source of truth is still the server-generated **Promotion Change Set** and **Approval Impact Review**."
>
> **Dev:** "Can approval notes be stored like ordinary comments?"
> **Domain expert:** "No. **Approval Context Notes** are **Sensitive Metadata** because they can reveal production plans, incidents, architecture, and provider targets."
>
> **Dev:** "Can approval emails include the agent's context note?"
> **Domain expert:** "No. **Approval Notifications** use low-privilege metadata and link to the authenticated approval view. They do not include **Approval Context Note** plaintext."
>
> **Dev:** "Can I approve directly from email or a push notification?"
> **Domain expert:** "No. **Approval Notifications** may deep-link to the authenticated approval view, but approval happens only after normal authorization and a **High-Assurance Challenge**."
>
> **Dev:** "What happens if I open an approval notification after the request was canceled or superseded?"
> **Domain expert:** "It opens the authenticated approval view in a closed or stale state. The view must not offer approval, rejection, cancellation, **Promotion**, or delivery-changing actions for that **Approval Request**."
>
> **Dev:** "Can I still inspect what the old approval request contained?"
> **Domain expert:** "Yes, if you are currently authorized. A closed or stale approval view may show immutable request facts such as the **Promotion Change Set**, exact **Draft Version** IDs, status, actors, timestamps, and **Partial Approvals**. **Approval Context Notes** and **Approval Rejection Notes** still require **Sensitive Detail Gate**."
>
> **Dev:** "Can push notifications be the main way I find out about production approvals?"
> **Domain expert:** "Yes. Browser/mobile push is the **Primary Approval Notification Channel** when a **Push Device Registration** exists, but it only opens the authenticated approval view."
>
> **Dev:** "Can a push notification say which production environment or secret needs approval?"
> **Domain expert:** "No. Push **Approval Notifications** are lock-screen safe and generic. The authenticated approval view may show **Display Names** after authorization, but fetches decrypted **Sensitive Metadata** only after a **Sensitive Detail Gate**."
>
> **Dev:** "If a normal browser session is hijacked, can the attacker open the approval view and read sensitive details?"
> **Domain expert:** "No. A normal session can see low-detail pending state, but decrypted **Sensitive Metadata** requires a **Sensitive Detail Gate**."
>
> **Dev:** "Do normal product names need a Sensitive Detail Gate?"
> **Domain expert:** "No. User-authored names are normal **Display Names** shown after authentication and authorization."
>
> **Dev:** "Can a signed-in browser add or replace a push device silently?"
> **Domain expert:** "No. Creating or replacing a **Push Device Registration** requires a **High-Assurance Challenge** because it changes where approval activity can be observed."
>
> **Dev:** "Should an agent be able to create several pending production approval requests?"
> **Domain expert:** "No. One **Protected Environment** has one pending promotion **Approval Request**. Newer requests supersede older ones and notifications coalesce around the latest request."
>
> **Dev:** "Can one approval both promote values and enable a new production sync destination?"
> **Domain expert:** "A single **Approval Request** has one approval purpose, so **Promotion** and **Protected Delivery Configuration Changes** stay distinct in authority and audit. A single **Publish** can still clear both in one interruption when the acting **User** is individually authorized for each."
>
> **Dev:** "Does a production sync mean every variable in the environment goes to the provider?"
> **Domain expert:** "No. A **Secret Sync** has exact **Secret Sync Bindings** for the variables selected for that destination."
>
> **Dev:** "If I remove a variable from a sync, should the provider copy remain?"
> **Domain expert:** "No. Removing a **Secret Sync Binding** creates a **Managed Provider Delete** for the provider-side copy that binding managed. Disabling the sync is different and leaves existing provider copies in place with a warning."
>
> **Dev:** "What happens if I delete the whole sync?"
> **Domain expert:** "That is **Secret Sync Deletion**. It removes all **Secret Sync Bindings**, creates **Managed Provider Deletes** for their provider-side copies, and tombstones the sync for audit. Use **Secret Sync Disable** when you only want to pause writes."
>
> **Dev:** "What if provider cleanup fails while deleting a sync?"
> **Domain expert:** "Tombstone the sync, alert the **User**, and preserve **Orphaned Managed Provider Copy** metadata for retry cleanup. Treat it as a warning, not a critical platform failure."
>
> **Dev:** "When an agent stands up a whole new environment, does the human get pinged for every change?"
> **Domain expert:** "No. The agent assembles a **Staged Change Set** in a non-protected context, and the human takes one interruption at **Publish**. **Publish** clears every gate the acting **User** is individually authorized to clear under one **High-Assurance Challenge** bound to the exact batch."
>
> **Dev:** "Does batching let the agent self-approve a change that needs two people?"
> **Domain expert:** "No. Where a multi-approval **Protected Approval Policy** applies, **Publish** still fans the **Promotion** out to a **Distinct Approver**. Batching never collapses a multi-approval policy into **Requester Self-Approval**."
>
> **Dev:** "The agent hit a step-up it cannot clear. What now?"
> **Domain expert:** "It fails closed with a step-up signal carrying a bounded operation, the human clears the **High-Assurance Challenge** out-of-band, and the agent resumes against that same bounded operation. An **Agent** acting in a human session cannot satisfy a **High-Assurance Challenge** itself."
>
> **Dev:** "Can the agent set up the GitHub **App Connection** as part of the batch?"
> **Domain expert:** "No. An **App Connection** is **Organization**-owned, set up live by a human once per provider, and it survives that **User's** offboarding. If no connection covers the needed **Connection Boundary**, the agent hands off to a human before the batch can reference it."
