# ADR-0056: Supply-Chain Hardening Posture

Date: 2026-05-25
Status: Accepted

insecur hardens its dependency install path with pnpm 10. Lifecycle scripts are blocked by default and gated by an explicit `onlyBuiltDependencies` allowlist (for example `esbuild` and `workerd`), with `strictDepBuilds: true` so an install fails loudly when a dependency wants to run a build or postinstall script that has not been decided. Newly published versions are quarantined with `minimumReleaseAge: 4320` (minutes, three days) in `pnpm-workspace.yaml`, so a version cannot be installed until it has been public long enough for a compromised release to surface. GitHub-native Dependabot version updates honor the same floor via `cooldown.default-days: 3` in `.github/dependabot.yml` (no hosted Renovate app on the private repo), so it will not open an update PR before the floor elapses. Install-time script blocking and release-age quarantine live in `pnpm-workspace.yaml`; update-bot cooldown lives in `.github/dependabot.yml`. Because `minimumReleaseAge` and `strictDepBuilds` are pnpm 10 features and the repository is pinned at `pnpm@9.0.0`, this decision forces the pnpm 9 to 10 upgrade. It implements and extends the dependency and supply-chain scanning posture that ADR-0008 requires.

The two highest-frequency npm attack vectors are a malicious lifecycle script that runs at install time and a freshly published compromised version pulled before anyone notices. Blocking unapproved lifecycle scripts closes the first; quarantining new releases for three days closes the second. Both are install-time controls that protect every caller (developer, agent, and CI) identically, which matters most for a product that stores customer secrets.

## Considered Options

- **pnpm defaults.** Rejected: pnpm 10 blocks scripts by default but without an enforced allowlist discipline lifecycle decisions stay ad hoc, and there is no release-age floor, leaving the just-published-malware window open.
- **`minimumReleaseAge` only, without `strictDepBuilds`.** Rejected: it still allows arbitrary postinstall scripts to run for any package not consciously excluded.
- **Aikido Safe Chain or equivalent real-time malware threat-intel wrapping the pnpm CLI.** Deferred as an optional future layer that is additive to the above, not required for V1.

## Consequences

- Adding a dependency that needs a build step requires a deliberate, PR-reviewed edit to `onlyBuiltDependencies`. This friction is intended.
- A genuinely urgent same-day patch is delayed up to three days by the quarantine. The documented override is to raise or waive `minimumReleaseAge` consciously for that specific change, never to remove the floor globally.
- The pnpm 9 to 10 upgrade is a prerequisite for this posture, not an optional follow-up.
