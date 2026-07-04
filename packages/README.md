# Packages

This directory contains the 20 workspace packages for insecur. The package map lives in
`../docs/context-map.md`; the glossary lives in `../CONTEXT.md`.

Packages are cut around deep modules with explicit Interfaces, not around
database tables, routes, or every heading in the glossary.

Each package has a local `CONTEXT.md` file. Use it as the first package-local
reading map before loading slices of the root `../CONTEXT.md`.

## Current Scaffold

- `@insecur/domain` - shared domain primitives and stable vocabulary shapes
- `@insecur/token-signing` - shared HS256/HMAC signed-token codec
- `@insecur/auth` - WorkOS session composition, User actor context, and CLI exchange contract
- `@insecur/machine-auth` - Machine Identity auth method exchange and OIDC trust matching (staged M4 package; complete and tested, but no API exchange route consumes it yet)
- `@insecur/access` - Effective Access Resolver and scope-first authorization
- `@insecur/tenant-store` - Tenant-Scoped Store and RLS adapter contract
- `@insecur/custody-contracts` - plaintext-free custody metadata and wrapped material contracts
- `@insecur/crypto` - Keyring and Encryption Envelope
- `@insecur/tenant-keyring` - Runtime-only tenant-backed keyring composition
- `@insecur/audit` - Audit Event Writer
- `@insecur/backup-restore` - encrypted backup metadata, restore drill evidence, recovery canary verification
- `@insecur/release-gate` - Security Evidence Bundle assembly and release-gate skeleton
- `@insecur/secret-store-contracts` - public-safe Secret Write validation and error contracts
- `@insecur/secret-store` - Secret Version Store and Blind Secret Write rules
- `@insecur/runtime-injection-issue` - public-safe Injection Grant issue path and contracts
- `@insecur/runtime-injection` - Runtime Injection Grant Service
- `@insecur/onboarding` - Guided Organization Provisioning
- `@insecur/instance-bootstrap` - Instance Bootstrap and Bootstrap Operator Claim completion
- `@insecur/operations` - Operation Store and Sync Target Serialization
- `@insecur/worker-kit` - shared Worker HTTP/auth/RPC composition glue
- `@insecur/cli` - local CLI composition and command execution

## Package README Checklist

Each package README should keep these sections current:

- Owns
- Consumes
- Does Not Own
- Interface Tests
- Dependency Rule

Each package `CONTEXT.md` should keep these sections current:

- Role
- Read First
- Terms To Load
- Adjacent Terms
- Owns
- Does Not Own

When implementation starts, add concrete exported Interface docs before adding
callers. The README is the contract reviewers should check first.
