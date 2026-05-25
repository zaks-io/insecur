# Competitor Profiles: Platform-Native Secret Stores

Last updated: 2026-05-25. Figures from official pricing/docs; verify before quoting.
Summary and wedge analysis live in [competitive-landscape.md](competitive-landscape.md).

These are the free/included baseline insecur layers on top of. **All seven are
single-platform: none natively sync secrets to another platform.** Cross-platform
distribution is exactly the gap a multi-platform tool fills.

---

## AWS Secrets Manager

- **Positioning:** Managed per-secret store for AWS workloads, built-in rotation, IAM-tied.
- **Pricing:** $0.40 per secret per month (prorated hourly) + $0.05 per 10,000 API calls.
  Rotation adds no separate fee beyond the API calls it generates.
- **Limits:** 64 KB max secret value; up to 500,000 secrets per account per region; high
  configurable GetSecretValue rate.
- **Features:** Versioning (staging labels AWSCURRENT/AWSPREVIOUS), native scheduled Lambda
  rotation, IAM + resource policies, CloudTrail audit, KMS at rest.
- **Cross-platform sync:** No (AWS-only; replication is region-to-region within AWS).
- **Runtime:** GetSecretValue via SDK/CLI/API returns plaintext to any permitted principal.
- Sources: https://aws.amazon.com/secrets-manager/pricing/ ;
  https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_limits.html

---

## GCP Secret Manager

- **Positioning:** Per-version-billed store native to Google Cloud IAM.
- **Pricing:** $0.06 per active version/mo + $0.03 per 10,000 access ops + $0.05 per rotation
  notification. Free: first 6 active versions and 10,000 access ops/month.
- **Limits:** 64 KiB per version. Access 90,000/min per project; management 600/min;
  add-version ~2 req/s global. Max secrets-per-project and max-versions-per-secret not
  published (quota-governed, raisable).
- **Features:** First-class versioning, rotation scheduling with Pub/Sub (you supply logic),
  Cloud IAM RBAC, Cloud Audit Logs, CMEK.
- **Cross-platform sync:** No (GCP-only; multi-region within GCP).
- **Runtime:** AccessSecretVersion via API/SDK returns plaintext; Cloud Run/GKE mounts.
- Sources: https://cloud.google.com/secret-manager/pricing ;
  https://docs.cloud.google.com/secret-manager/quotas

---

## Azure Key Vault

- **Positioning:** Transaction-billed vault for secrets/keys/certs, Entra ID integrated.
- **Pricing:** No storage charge; $0.03 per 10,000 transactions (Standard). Every authenticated
  REST call is a transaction. HSM keys / cert ops priced separately (Premium).
- **Limits:** 25 KB max per secret. No documented object-count limit (throttling-bound, e.g.
  ~2,000 secret GET/10s at subscription/region scale). 500+ versions degrades backup.
- **Features:** Versioning; no built-in secret auto-rotation (Event Grid + Functions, or
  managed for keys/certs); Azure RBAC or access policies; Azure Monitor audit.
- **Cross-platform sync:** No (Azure-only).
- **Runtime:** REST/SDK with managed identity returns plaintext; Key Vault references in
  App Service/Functions; CSI driver in AKS.
- Sources: https://azure.microsoft.com/en-us/pricing/details/key-vault/ ;
  https://learn.microsoft.com/en-us/azure/key-vault/general/service-limits

---

## Cloudflare Secrets Store

- **Positioning:** Account-level encrypted secrets reusable across Workers, replacing
  duplicated per-Worker secrets. **The store insecur's Cloudflare half competes against.**
- **Pricing:** Free in open beta (up to 100 secrets/account). Paid pay-as-you-go pricing not
  published ("finalizing"). Beta cap was 20, raised to 100 in May 2025.
- **Limits:** 100 secrets per account; **exactly one store per account**; value must be a
  string **≤ 1024 bytes** (far smaller than 25–64 KB elsewhere). Rate limits not published.
- **Features:** Audit logging yes. Three scoped roles: Admin (manage), Reporter (metadata
  only), Deployer (bind to Workers). Versioning not documented. Rotation not yet available
  (customer-managed DEKs / KEK rotation stated as future). **Write-once: cannot be read back
  via API or dashboard once added.**
- **Cross-platform sync:** No (Cloudflare-only; Workers and AI Gateway today).
- **Runtime / Workers binding:** wrangler `secrets_store_secrets = [{binding, store_id,
  secret_name}]`; read via `await env.<BINDING>.get()` returning plaintext in the Worker.
- **Status:** Still open beta (not GA) in 2026; launched Apr 2025.
- **Per-Worker secrets (`wrangler secret put`):** older, distinct mechanism. Attaches to one
  Worker, deployed with code, `env.MY_SECRET`. Encrypted at rest, hidden after set. No
  account-level reuse, no scoped roles. Secrets Store is the centralized replacement.
- Sources: https://developers.cloudflare.com/secrets-store/ ;
  https://developers.cloudflare.com/secrets-store/manage-secrets/ ;
  https://blog.cloudflare.com/secrets-store-beta/ ;
  https://developers.cloudflare.com/workers/configuration/secrets/

---

## Vercel Environment Variables

- **Positioning:** Project-scoped env vars included with the platform; "Sensitive" flag for
  encrypted, hidden, write-only values.
- **Pricing:** Included in all plans. Audit logs Enterprise-only.
- **Limits:** 64 KB total across all names + values per deployment. Scoped to
  Production/Preview/Development.
- **Features:** Encryption at rest; Sensitive vars are encrypted and hidden (write-only after
  set); team can force all new Production/Preview vars to be Sensitive. No versioning, no
  rotation.
- **Cross-platform sync:** No (Vercel-only).
- **Runtime:** Injected at build and runtime as `process.env.VAR`. Non-sensitive values are
  readable in the dashboard and leak into build logs if printed (the April 2026 Vercel
  incident; only Sensitive-marked vars stayed protected). Plaintext at runtime.
- Sources: https://vercel.com/docs/environment-variables ; https://vercel.com/docs/limits ;
  https://vercel.com/docs/environment-variables/sensitive-environment-variables

---

## GitHub Actions Secrets (+ Dependabot)

- **Positioning:** CI/CD secrets included with GitHub, scoped repo/org/environment, injected
  into workflow runs.
- **Pricing:** Included with GitHub plans.
- **Limits:** 48 KB per secret. Counts: 1,000 org secrets, 100 repo, 100 environment. Larger
  values must be encrypted and split.
- **Features:** No versioning, no rotation, no read-back (write-only, masked in logs). RBAC via
  repo/org/environment scoping + environment protection rules (required reviewers, branch
  restrictions). Org/Enterprise audit log. Org secrets scopable to selected repos.
- **Cross-platform sync:** No (GitHub-only). OIDC federation lets workflows assume cloud roles
  without storing long-lived cloud secrets — a notable alternative to static secrets, and the
  path insecur itself uses for CI.
- **Runtime:** `${{ secrets.NAME }}` / env vars; plaintext inside the runner, masked in logs.
  **Not available to Dependabot-triggered workflows.**
- **Dependabot Secrets:** separate store because Actions secrets are NOT accessible to
  Dependabot-initiated workflows/PRs. Repo/org level, referenced in `dependabot.yml`. Same
  write-only/masked model.
- Sources: https://docs.github.com/en/actions/reference/security/secrets ;
  https://docs.github.com/en/code-security/reference/secret-security/understanding-github-secret-types

---

## Cross-cutting takeaways (the native baseline)

- **Single-platform is universal.** A secret in one store is invisible to the others; keeping
  the same secret in sync across Cloudflare/Vercel/GitHub is fully manual today. This is the
  core wedge for a multi-platform tool.
- **Plaintext at runtime everywhere.** All return decrypted plaintext to authorized
  callers/runtimes; security is access control + encryption at rest + sometimes write-only
  dashboards, not zero-knowledge or no-reveal custody.
- **Cloud providers (AWS/GCP/Azure) are full-featured and metered** (versioning, rotation,
  fine-grained IAM, audit). **Platform freebies (Vercel/GitHub) and Cloudflare Secrets Store
  are simpler**: little/no versioning, no/limited rotation, coarse RBAC.
- **Size cliffs:** Cloudflare 1 KB ≪ Azure 25 KB < AWS/GCP/Vercel-total/GitHub 48–64 KB.
- **Cloudflare Secrets Store is the least mature** (1 KB values, 100 secrets, one store per
  account, still beta, unpublished paid pricing) — relevant because it is the weakest native
  store on insecur's primary target platform.
