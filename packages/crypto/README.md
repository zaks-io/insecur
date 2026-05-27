# @insecur/crypto

Keyring and Encryption Envelope.

This package owns tenant-bound encryption behavior below higher domain modules.
It should expose wrapped material and readiness facts, not plaintext storage
shortcuts.

## Owns

- Keyring Interface for tenant data key resolution.
- Organization Data Key, Project Data Key, and Key Version shapes.
- Encryption Envelope behavior and wrapped-material result shapes.
- Ciphertext Identity Binding rules.
- Cross-tenant key and ciphertext mis-binding tests.

## Consumes

- `@insecur/domain` for tenant and resource identity shapes.
- Key custody adapters when implementation reaches root-key material.

## Does Not Own

- Secret Version append/current lifecycle.
- Provider Credential lifecycle.
- Runtime Injection or Secret Sync delivery policy.
- Tenant-Scoped Store transaction ownership.
- Audit event formatting.

## Interface Tests

Tests should prove encrypted material cannot be decrypted under the wrong
Organization, Project, Environment, Secret, record identity, or Key Version.
Rotation tests belong here when they exercise key wrapping rather than a higher
workflow.

## Dependency Rule

This package may depend on `@insecur/domain`. It must not depend on
`@insecur/secrets`; the Secret Version Store consumes this package, not the
other way around.
