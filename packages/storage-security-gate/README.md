# @insecur/storage-security-gate

Metadata-only Storage Security Gate verdict interface for production delivery readiness.

The gate composes readiness facts from injected probes and returns a fail-closed verdict. It
never returns Sensitive Values, key material, Provider Credentials, or decrypted metadata.

Canonical contract: `docs/storage-security-gate.md`.

## Owns

- The metadata-only readiness verdict interface and its result shape.
- The stable `storage.*` control ID catalog.
- Fail-closed verdict derivation from per-control probe outcomes.
- Production delivery gate enforcement and `StorageGateDeliveryError`.
- Readiness-fact adapters that convert deeper-module facts into probe outcomes.
- The metadata-safety assertion applied to every probe outcome.

## Consumes

- `@insecur/domain` for identity, result, and error-code shapes.

## Does Not Own

- Probe implementations. Every readiness fact is injected by the caller.
- Keyring construction, encryption, or decrypt.
- The Tenant-Scoped Store implementation, provider writes, or Runtime Injection execution.

## Usage

```typescript
import {
  evaluateStorageSecurityGate,
  STORAGE_SECURITY_GATE_CONTROL_IDS,
} from "@insecur/storage-security-gate";

const verdict = await evaluateStorageSecurityGate({
  scope: { organizationId: "org_01...", projectId: "prj_01..." },
  probes: {
    checkRootKey: async () => ({
      status: "passed",
      summary: "Root key binding is configured.",
      evidence: [{ kind: "configuration_version", id: "root_key_v1" }],
    }),
    // ...remaining probes
  },
});
```

## Readiness fact audit

Control-to-source coverage for composable probes lives in `docs/readiness-fact-audit.md`.
Deeper modules expose metadata-only facts; `mapReadinessReportToProbeOutcome` converts them
into gate probe outcomes without adding crypto or tenant-store dependencies to this package.

## Interface Tests

Tests assert that a missing or failing control produces a blocked verdict, that verdict
derivation is fail-closed, that production delivery enforcement refuses on anything but a
passing verdict, and that readiness-fact adapters stay metadata-safe.

Run them with `pnpm --filter @insecur/storage-security-gate test`.

## Dependency Rule

This package depends on `@insecur/domain` only. Staying off the crypto and tenant-store graph
is what lets the gate be composed at any layer, and it is why probes are injected rather than
implemented here.
