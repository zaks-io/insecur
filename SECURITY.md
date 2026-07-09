# Security Policy

insecur is prelaunch. The hosted product at `insecur.cloud` is owned and operated by Zaks.io, LLC.
The public endpoints exist, but the production release gate is not complete and `insecur.cloud`
should not be treated as approved custody for valuable production secrets yet.

This policy covers vulnerability reporting, public endpoint scope, and the current security setup in
this repository.

## Report A Vulnerability

Report suspected vulnerabilities privately to:

security@zaks.io

GitHub private vulnerability reporting may also be used when the form is available:

https://github.com/zaks-io/insecur/security/advisories/new

A public issue is acceptable only when it contains no exploit details, credentials, session
material, or sensitive tenant data.

Include:

- Affected endpoint, package, CLI command, or workflow.
- Impact and the security boundary crossed.
- Reproduction steps using test data only.
- Logs, screenshots, or traces with secrets and personal data removed.

Do not include real customer secrets, access tokens, private keys, session cookies, or unrelated
third-party data.

We aim to acknowledge reports within 2 business days, then keep the report private until a fix or
mitigation is available.

## Public Endpoint Scope

The authoritative route inventory is
[`docs/specs/deploy-route-inventory.md`](docs/specs/deploy-route-inventory.md) (generated via
`pnpm routes:inventory` from route mounts plus `deploy-route-inventory.sidecar.json`). Regenerate
that inventory and update this section together when the public surface changes; the
`pnpm conformance:security-md` gate (part of `pnpm verify`) fails CI when this section drifts from
the inventory.

| Surface         | Production endpoint                                                                            | Preview endpoint                    | Public route groups                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public Site     | `https://insecur.cloud`, `https://www.insecur.cloud`, plus `insecur.dev` apex/www (error URIs) | `https://preview.insecur.cloud`     | `GET /`, `GET /healthz`, `GET /docs/*` (HTML plus `.md` twins), `GET /errors/*`, `GET /llms.txt`, `GET /llms-full.txt`, `GET /privacy`, `GET /security`, `GET /terms`, `GET /badges/coverage.json`, `GET /.well-known/insecur/audit-export-signing-keys.json`, `GET /install.sh`, `GET /install.ps1` |
| Web Console BFF | `https://app.insecur.cloud`                                                                    | `https://app.preview.insecur.cloud` | `GET /healthz`, `GET /`, `/login`, `GET /auth/*` (callback, step-up, approval-step-up, passkey enrollment), `POST /logout`, `GET /whoami`, `GET /onboarding`, `GET /orgs/*`                                                                                                                          |
| API             | `https://api.insecur.cloud`                                                                    | `https://api.preview.insecur.cloud` | `GET /healthz`, `/v1/auth`, `/v1/session`, `/v1/onboarding`, `/v1/instance/bootstrap`, `/v1/orgs/:organizationId/*`                                                                                                                                                                                  |
| Runtime         | None                                                                                           | None                                | No public routes. Direct fetches return `404`; access is only through private Cloudflare Service Binding RPC.                                                                                                                                                                                        |

Current organization-qualified API groups under `/v1/orgs/:organizationId/*` include
approval-requests, audit-events, audit-export, connections, design-partner-feedback,
first-value-usage, high-assurance-challenges, invitations, members, operations, organizations,
projects, run-policies, runtime-injection, and webhook-subscriptions.

## What To Report

Please report suspected issues involving:

- Secret value disclosure, plaintext persistence, or secret material in logs, traces, telemetry,
  audit output, install scripts, or CLI output.
- Authentication, session, CSRF, WorkOS callback, or token audience bypasses.
- Cross-tenant access, organization/project authorization bypasses, or object-existence leaks.
- Runtime Injection grant issue or consume bypasses.
- A public route, Web BFF route, or Public Site route gaining database, keyring, Runtime, or API
  capability it should not have.
- Installer tampering, checksum bypass, release artifact confusion, or supply-chain compromise.
- CI, deploy, scanner, or branch-protection gaps that would let security-sensitive changes merge
  without the required gates.

Out of scope unless they expose a product vulnerability:

- Volumetric denial-of-service testing.
- Social engineering, phishing, or physical attacks.
- Findings requiring access to someone else's account, device, browser profile, or cloud account.
- Scanner output without a concrete exploit path or boundary crossed.

## Current Security Setup

The repository's security model is intentionally structural, not just conditional checks in one
process:

- `apps/api` is the public API Worker. It holds no root-key binding and no Hyperdrive binding.
- `apps/runtime` is the private Runtime Worker. It is the only deploy with
  `INSTANCE_ROOT_KEY_V1`, the only deploy that decrypts, and it serves no public routes.
- `apps/web` is the browser-facing BFF. It owns the web session and reaches the API over a private
  Service Binding.
- `apps/site` serves the public site, documentation, and installers. It has no auth session, database, keyring, API,
  Runtime, or product-control-plane binding.

The main local gate is:

```sh
pnpm verify
```

That gate includes duplicate-code checks, unused-code/dependency checks, workflow lint, GitHub
Actions pinning conformance, deploy-topology conformance, package-boundary conformance, public-site
boundary conformance, CLI release-boundary conformance, formatting, script tests, lint, typecheck,
and unit tests.

Hosted CI also runs coverage, Postgres integration/RLS/e2e tests, gitleaks secret scanning, semgrep
SAST, and syft plus grype SBOM vulnerability scanning. A scheduled `security-daily` workflow repeats
the scanner families and can file metadata-only Linear issues when reporting is explicitly enabled.

Security-sensitive release evidence is metadata-only by design. Evidence bundles, runbooks, and
release gates must not include Sensitive Values, decrypted Sensitive Metadata, provider raw bodies,
child-process environments, key material, or plaintext secrets.

## Production Readiness Limits

The current repo contains delivered First Value code and deployed preview/production endpoints, but
the project is still prelaunch. Known limits include:

- The full production launch gate is not complete.
- Production Secret Delivery and Secret Sync must remain blocked until the Storage Security Gate
  passes.
- Customer-managed key custody, self-hosted instances, and Service Access are deferred.
- The hosted custody model is not zero-knowledge; insecur-controlled infrastructure can technically
  decrypt under the accepted V1 model, even though the product surface removes unsupported plaintext
  read paths.
- Runtime Injection is a delivery/read boundary: an approved child process receives plaintext in its
  environment and can read it after delivery.

Do not market or document stronger claims than the governing specs, ADRs, tests, and shipped code
support.
