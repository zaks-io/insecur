# @insecur/storage-security-gate

Metadata-only Storage Security Gate verdict interface for production delivery
readiness. Composes readiness facts from injected probes; never returns Sensitive
Values, key material, Provider Credentials, or decrypted metadata.

Canonical contract: `docs/storage-security-gate.md`.

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

## Tests

- `pnpm --filter @insecur/storage-security-gate test`
