# Competitor Profiles: Dedicated Secrets Platforms

Last updated: 2026-05-25. Figures from official pricing/docs pages; verify before quoting.
Summary and wedge analysis live in [competitive-landscape.md](competitive-landscape.md).

---

## Doppler

- **Positioning:** Developer-first, SaaS-only secrets manager, Heroku-style DX.
- **Pricing:** Developer free for 3 users then $8/user/mo; Team $21/user/mo; Enterprise custom.
  Custom roles, user groups, extra syncs are $9/seat/mo add-ons on Team.
- **Limits (Dev / Team / Ent):** Users 25 / 500 / custom. Projects 10 / 250 / custom.
  Environments 4 / 15 / custom. Service tokens 50 / 500 / custom. Config syncs 5 / 100 (500
  w/ add-on) / unlimited. Audit retention 3 days / 90 days / custom. Secrets-per-project and
  API rate limits not published.
- **Storage:** Tokenization; raw values never in the web DB. AES-256-GCM, per-workspace key,
  GCP KMS + HSM. Optional customer-managed EKM.
- **Structure:** Workplace > Project > Environment > Config.
- **RBAC:** Owner/Admin/Collaborator/Viewer + secret-scoped read/write; custom roles are a
  paid add-on. Can split "Manage Secrets" from "View Secrets".
- **Sync (native push):** Vercel, GitHub Actions, Cloudflare Pages, AWS PS/SM, GCP SM, Azure
  App Service/Key Vault, Heroku, Netlify, Railway, Render, Supabase, Terraform Cloud, many CI.
  **Cloudflare Workers is DIY-only** (CLI/API), not a native sync.
- **Runtime injection:** `doppler run -- <cmd>`.
- **CI/agent:** Service tokens (long-lived), service accounts (Team/Ent), GitHub Actions OIDC.
- **Reveal model:** Unmasked / Masked / Restricted. Restricted = never viewable in dashboard,
  only usable via service tokens; downgrading requires changing the value too. Enforcement is
  UI/role, not a storage-layer no-reveal guarantee.
- **Self-host:** No.
- **Approvals:** Change Requests (Team/Ent), code-review style Draft > Review > Approved > Merged.
- Sources: pricing https://www.doppler.com/pricing ; security
  https://docs.doppler.com/docs/security-fact-sheet ; visibility
  https://docs.doppler.com/docs/secret-visibility ; change requests
  https://docs.doppler.com/docs/change-requests ; integrations
  https://docs.doppler.com/docs/integrations

---

## Infisical

- **Positioning:** Open-source, self-hostable secrets + PKI + access platform. Vault-level
  control, better DX. insecur borrows its tenant shape.
- **Pricing:** Free $0 (cloud or self-host); Pro $18/mo per identity; Enterprise custom.
  Pricing counts identities = users + machines combined.
- **Limits (Free):** 5 identities, 3 projects, 3 environments, 10 integrations. Pro: unlimited
  projects/envs/integrations, 90-day audit. Secrets-per-project and rate limits not published.
- **Storage:** AES-256-GCM at rest; server can decrypt (not zero-knowledge by default).
  Postgres + Redis, MIT.
- **Structure:** Org > Project > Environment > Folder > Secret.
- **RBAC:** Org Admin/Member/No-Access; project Admin/Member/Viewer/No-Access + custom roles;
  subject-action-object model. Temporary access provisioning (Pro+).
- **Sync (native):** Cloudflare Workers, Vercel (OAuth2), GitHub Actions, GitLab, Render, AWS
  SM/PS, GCP SM, Azure KV, Heroku, Netlify, Railway, Terraform, Ansible, Kubernetes, 50+.
  **All three target platforms native.**
- **Runtime injection:** `infisical run -- <cmd>`; plus Infisical Agent sidecar.
- **CI/agent:** Machine identities (separate from seats), OIDC (GitHub, GitLab, AWS, Azure,
  GCP, K8s, generic), token exchange.
- **Reveal model:** All secrets plaintext-readable by any identity with `secrets/read`. No
  built-in write-only type. "Agent Vault" is a TLS-intercepting credential proxy that injects
  the real secret at the proxy layer so agents never see it, but it is a **research preview**,
  not production/default.
- **Self-host:** Yes (MIT, Docker/K8s, air-gapped). Self-host Pro/Ent needs a license.
- **Approvals:** Enterprise only; reviewers approve secret changes; access-request workflows.
- Sources: pricing https://infisical.com/pricing ; RBAC
  https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls ;
  CF Workers sync https://infisical.com/docs/integrations/secret-syncs/cloudflare-workers ;
  Agent Vault https://infisical.com/blog/agent-vault-the-open-source-credential-proxy-and-vault-for-agents

---

## Phase (phase.dev)

- **Positioning:** Open-source, end-to-end encrypted secrets manager, polished UI, self-host
  first-class. Closest competitor to insecur's reveal model.
- **Pricing:** Free $0; Pro $10/user/mo ($120/user/yr); Enterprise $25/user/mo ($300/user/yr).
- **Limits (Free / Pro / Ent):** Users 5 / unlimited / unlimited. Apps 3 / unlimited /
  unlimited. Environments 3 / 10 / unlimited. Audit 24h / 90 days / custom. Rate limit
  120 / 240 / custom req/min. Service tokens unlimited on all. Secrets-per-app not published.
- **Storage:** E2E. XChaCha20-Poly1305, X25519 key agreement, Argon2id KDF, XOR secret
  sharing. Server cannot decrypt.
- **Structure:** Org > App > Environment > Secret/Folder.
- **RBAC:** Custom roles + teams + network policies on Pro+.
- **Sync (native automatic):** Cloudflare Workers (sets "Encrypted" type), Vercel (OAuth2,
  Phase is source of truth), GitHub Actions, GitLab CI, Cloudflare Pages, Railway, AWS SM.
  **All three target platforms native.**
- **Runtime injection:** `phase run -- <cmd>`, `phase shell`.
- **CI/agent:** Service accounts (free, multi-app/env). OIDC for self-hosted (Google/Entra/
  JumpCloud); cloud GitHub-OIDC token exchange not explicitly documented.
- **Reveal model:** Three types. Config = plaintext in UI. Secret = masked, click to reveal.
  **Sealed = write-once, no reveal**; plaintext redacted server-side, never readable again,
  type locked. Still usable at runtime via injection. This is the strongest no-reveal
  primitive among the dedicated set, but it is opt-in per-secret, not the protected default.
- **Self-host:** Yes (OSS, Docker, air-gapped).
- **Approvals:** Not found in public docs.
- Sources: pricing https://phase.dev/pricing ; secrets
  https://docs.phase.dev/console/secrets ; crypto
  https://docs.phase.dev/security/cryptography ; CF Workers
  https://docs.phase.dev/integrations/platforms/cloudflare-workers

---

## EnvKey

- **Status:** Cloud shut down Feb 1, 2025. Only self-hosted OSS (MIT) remains. Not a live
  cloud competitor; useful as a flat-rate-economics cautionary tale.
- **Positioning:** Zero-knowledge E2E secrets/config with local dev parity.
- **Pricing (historical cloud, now dead):** Basics $49/mo (7 users), Pro $149/mo (15), Business
  $499/mo (50). Self-host Community free (MIT); Enterprise self-host commercial, unpublished.
- **Storage:** Zero-knowledge E2E, keys stay on client devices.
- **Structure:** Org > App > Environment > Branch; Block connections share values across apps.
- **RBAC:** App roles Developer/DevOps/Admin; per-environment grants.
- **Sync:** None native to CF/Vercel/GitHub. Integration is runtime injection via
  `envkey-source` (`es`) wrapping process startup; CI uses a per-env ENVKEY token.
- **Runtime injection:** `envkey-source` / `es`, `--watch`, `--rolling`.
- **CI/agent:** Per-server/CI tokens, long-lived, scoped. No clear OIDC, no machine-identity
  abstraction.
- **Reveal model:** Server can't decrypt; authorized clients/users read plaintext client-side.
  No sealed/restricted type. No delivery-without-reveal.
- **Self-host:** Yes (OSS, the only remaining option). Needs Linux/Node, MySQL 8, SMTP, TLS.
- **Approvals:** Not found.
- Sources: https://v2.envkey.com/ ; self-host
  https://docs-v2.envkey.com/docs/self-hosting-open-source-envkey ; shutdown thread
  https://news.ycombinator.com/item?id=41134184

---

## HashiCorp Vault (Community / Enterprise) + HCP Vault Dedicated

- **Positioning:** Industry-standard secrets engine. Community OSS self-host; Enterprise adds
  namespaces/replication/Sentinel/Secrets Sync; HCP Vault Dedicated is managed Enterprise.
- **HCP Vault Secrets (the lightweight SaaS analog) is dead:** end-of-sale Jun 30 2025, EOL
  Jul 1 2026. Remaining options are HCP Dedicated or self-host.
- **Pricing:** Community free self-host. Enterprise self-host contact-sales (per node).
  HCP Dedicated: Dev ~$0.616/hr (~$450/mo, 25-client hard cap, no HA); Essentials ~$1.578/hr
  small cluster (~$1,152/mo) + ~$72.92/mo per client; Standard ~$1.843/hr (~$1,345/mo) +
  ~$72.92/client, adds replication + Secrets Sync + Sentinel.
- **Storage:** KV v1/v2 (versioned). Dynamic secrets (DBs, AWS/Azure/GCP IAM, SSH, PKI, K8s).
- **RBAC:** HCL path policies (Community); namespaces + Sentinel (Enterprise).
- **Secrets Sync destinations (Enterprise / HCP Standard only):** AWS SM, Azure KV, GCP SM,
  GitHub, Vercel. **No Cloudflare Workers.**
- **Runtime injection:** K8s Agent Injector sidecar; Vault Agent templates. No `run`-style exec
  wrapper.
- **CI/agent:** AppRole, JWT/OIDC (GitHub Actions OIDC), AWS/Azure/GCP IAM, K8s SA tokens.
  Short-lived tokens, configurable TTL.
- **Reveal model:** No no-reveal. CLI/API return plaintext. Enterprise Control Groups require
  N-of-M authorizers before release, but release still yields plaintext.
- **Self-host:** Yes (Community, Enterprise). HCP Dedicated is managed.
- **Approvals:** Control Groups (Enterprise/HCP Standard). No JIT request UI in Community.
- Sources: editions https://developer.hashicorp.com/vault/tutorials/get-started/available-editions ;
  Secrets Sync https://developer.hashicorp.com/vault/docs/sync ; HCP tiers
  https://developer.hashicorp.com/hcp/docs/vault/get-started/deployment-considerations/tiers-and-features ;
  pricing https://www.ibm.com/products/hashicorp/pricing

---

## Akeyless

- **Positioning:** SaaS-first / hybrid, "Vaultless" Distributed Fragments Cryptography (DFC),
  zero-knowledge without running vault infra. Enterprise-leaning.
- **Pricing:** Free forever (usage-capped); Enterprise contact-sales, usage-based. Dollar
  amounts not published.
- **Limits (Free):** 5 clients, 500 static secrets, 5 dynamic, 5 rotated, 3 targets, 1 gateway
  cluster, 1,000 encryption txns/day, 5 keys, 5 certs, 3 password-manager users.
- **Storage:** Vaultless DFC, key fragments split, full key never assembled. Hybrid keeps a
  fragment on-prem. Dynamic secrets (DBs, AWS/Azure/GCP, SSH, K8s).
- **RBAC:** Roles attached to auth methods; item-level policies; access rules with sub-claims.
- **Sync:** No push-sync product. GitHub Action for auth+fetch; K8s injector; Terraform/Ansible/
  Jenkins via CLI/SDK. **No documented Cloudflare Workers or Vercel integration.** Fetch model.
- **Runtime injection:** CLI fetch; K8s injector; on-prem Gateway for local caching. No
  `run`-style exec wrapper documented.
- **CI/agent:** OIDC/JWT (Auth0, Entra, GitHub Actions, GitLab, Google, Okta), cloud IAM,
  Universal Identity API keys, K8s SA. Short-lived scoped tokens.
- **Reveal model:** No no-reveal. CLI/API return plaintext. Company can't read (DFC), but
  authorized identities can. JIT + approval limits exposure window.
- **Self-host:** Hybrid only (on-prem Gateway, cloud control plane). No full self-host.
- **Approvals:** Built-in JIT request/approve (`request-access`), temp role auto-expires ~1h,
  events to ServiceNow/Slack/Teams/email. Static secrets and targets only.
- Sources: pricing https://www.akeyless.io/pricing/ ; request access
  https://docs.akeyless.io/docs/request-access

---

## 1Password (Secrets Automation / Connect / Service Accounts / CLI / SDK)

- **Positioning:** Password manager extended into dev secrets via CLI, service accounts,
  self-hosted Connect proxy, SDKs. For teams already on 1Password.
- **Pricing:** Bundled into existing plans (~$8/user/mo Business). Connect server is free and
  unlimited on all plans since Feb 27 2025.
- **Limits:** Service account reads/hr 1,000 (Teams) / 10,000 (Business); writes/hr 100 / 1,000;
  combined/24h 5,000 / 50,000 account-wide. Connect token caps 100 vaults/token; expiry
  30/90/180 days. Vaults and secrets-per-vault unlimited.
- **Storage:** Items in E2E-encrypted Vaults. No first-class versioning API (item history
  only). No dynamic secrets.
- **RBAC:** 12 vault-level permissions per user/group; access by group membership. No path
  policy language.
- **Sync:** Runtime-injection source, not a sync pusher. Official: GitHub Actions
  (`load-secrets-action`), K8s injector/operator, CircleCI, Jenkins, Ansible, Terraform,
  Pulumi, VS Code. **Vercel and Cloudflare Workers not officially listed.**
- **Runtime injection:** `op run --env-file -- <cmd>` (best-in-class DX), `op inject`,
  `op read op://...`. Secrets stay in subprocess env, not disk.
- **CI/agent:** Service Accounts (scoped, token-based). **No OIDC workload identity** — CI must
  store the service-account token as a platform secret. Connect proxy caches locally. No AppRole.
- **Reveal model:** `op run` keeps secrets off disk, but any vault "View Items" member can read
  plaintext. No "inject-but-operator-can't-read" concept. Agentic no-context-window injection
  is early-access.
- **Self-host:** SaaS; Connect is a self-hosted cache/proxy that syncs from cloud.
- **Approvals:** SaaS-app access requests (not secret-level); no secret-level JIT with TTL.
- Sources: Connect pricing https://www.1password.dev/connect/pricing/ ; rate limits
  https://www.1password.dev/service-accounts/rate-limits/ ; integrations
  https://www.1password.dev/integrations/

---

## Pulumi ESC (Environments, Secrets, Configuration)

- **Positioning:** IaC-native secrets/config; compose environments from many upstream sources
  and inject into provisioning and runtime. Most complete approval model of the set.
- **Pricing:** Individual free (25 secrets, then $0.50/secret/mo); Team $0.50/secret/mo;
  Enterprise $0.75/secret/mo; plus API calls: first 10,000/mo free then $0.10/10,000.
- **Limits:** Free 25 secrets, 10k API calls/mo, 1 member. Team unlimited secrets (billed),
  up to 10 base members. Audit + approvals + customer-managed keys = Enterprise+ only.
- **Storage:** "Environments" = YAML composing secrets from AWS SM, Azure KV, GCP SM, Vault,
  1Password, Infisical, plus inline encrypted values; `imports` for inheritance. Dynamic
  OIDC creds (AWS/Azure/GCP/Vault) and scheduled rotated secrets.
- **RBAC:** Org/team RBAC, environment-level + project-level permissions.
- **Sync:** Two modes. Runtime: `esc run <env> -- <cmd>`; GitHub Actions `pulumi/esc-action`
  (OIDC, no stored token); Cloudflare Workers via `esc run -- wrangler deploy`. Deploy-time:
  Pulumi IaC providers push to CF Workers `secretTextBindings`, Vercel, etc. Pull-from: many
  upstream sources. **No dedicated one-click sync to Vercel/CF; goes through `esc run` or IaC.**
- **Runtime injection:** `esc run <env> -- <cmd>`; `esc open` can project to files.
- **CI/agent:** First-class OIDC (GitHub, GitLab, CircleCI) for zero-stored-secret CI; Pulumi
  access tokens as fallback. No AppRole.
- **Reveal model:** `esc open --show-secrets` reveals plaintext to authorized users. Open
  Approvals (Enterprise+) require sign-off before opening, but the result is still plaintext.
  No structural no-reveal.
- **Self-host:** No. Pulumi IaC is OSS/self-hostable but ESC requires Pulumi Cloud.
- **Approvals:** Most mature here. Update Approvals (config changes) + Open Approvals (reading),
  JIT with reason/duration, configurable self-approval, fully logged. Enterprise+ only.
- Sources: pricing https://www.pulumi.com/pricing/ ; approvals
  https://www.pulumi.com/docs/esc/administration/approvals/ ; versioning
  https://www.pulumi.com/docs/esc/environments/versioning/ ; CF integration
  https://www.pulumi.com/docs/esc/integrations/infrastructure/cloudflare/

---

## Cross-cutting findings

- **No product ships true delivery-without-reveal as a default.** Phase Sealed (opt-in type)
  and the Doppler Restricted mode (UI/role) come closest on the storage side; Vault Control
  Groups and Pulumi Open Approvals gate reveal but still end in plaintext.
- **Only Infisical and Phase natively sync to all three** of Cloudflare Workers + Vercel +
  GitHub Actions. Both are general-purpose, not stack-opinionated, and neither frames the
  agent/CI custody threat model.
- **Approval workflows are usually Enterprise-gated** (Infisical, Vault, Pulumi ESC) or absent
  (Phase, EnvKey, 1Password). Doppler offers them at Team.
- **OIDC for CI is now common** (Doppler, Infisical, Vault, Akeyless, Pulumi ESC) but notably
  missing from 1Password.
- **HCP Vault Secrets dying (Jul 2026)** leaves a gap in the "lightweight managed Vault" niche.
