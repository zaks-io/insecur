# Setup

There is not yet a supported product setup path for storing or delivering secrets. The accepted
setup path today is contributor and agent verification of the scaffold:

1. Use Node 24 and pnpm 10.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Run `pnpm verify`.
4. Optionally run the copyable proof:
   `INSECUR_PROOF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node examples/first-value-proof/verify.mjs`.

V1 product setup guidance should be written only after the tenant-first authorization model,
WorkOS AuthKit, short-lived machine access, tenant-bound key hierarchy, Sensitive Metadata
encryption, audit/export integrity, and
[security release gates](security-runbooks-and-release-gates.md) are implemented. Until then,
scaffold verification commands are contributor documentation only and must not be used with
valuable secrets.
