# ADR-0086: Rust CLI And Verifiable Native Distribution

Date: 2026-07-17

Status: Accepted (amends [ADR-0007](0007-developer-first-cli-contract.md) and extends
[ADR-0056](0056-supply-chain-hardening-posture.md))

The CLI is part of insecur's custody boundary: it collects Sensitive Values, stores local custody
material, consumes one-use injection grants, and constructs child-process environments. The
current release already compiles the TypeScript CLI and Bun runtime into standalone platform
binaries. The Public Site installers download those binaries from GitHub Releases, verify their
checksums, and verify GitHub build provenance against this repository and the pinned CLI release
workflow. Customers therefore do not run npm or resolve the JavaScript dependency graph during
installation.

The remaining trust surface is concentrated in the release build: the shipped binary embeds a
JavaScript runtime, and its source is assembled from an npm/pnpm dependency graph before Bun
compiles it. ADR-0056 reduces that build risk through blocked lifecycle scripts and dependency
quarantine, but the customer-facing custody tool still inherits the JavaScript runtime and its
controlled build-input graph.

Rust and Cargo do not make dependencies intrinsically trustworthy. Cargo build scripts and
procedural macros execute code during compilation, and native dependencies still require review.
The useful boundary is instead that insecur can compile those inputs in an isolated release system
and give customers one signed, inspectable artifact that requires no language runtime or package
manager on their machines.

## Decision

The target implementation of the customer-facing `insecur` CLI is Rust, distributed primarily as
prebuilt native binaries. The TypeScript CLI remains the behavioral reference during the
transition and is removed only after the Rust binary satisfies the compatibility and release gates
below. This decision changes the CLI implementation and release boundary, not the Worker, Web, or
Site implementation languages.

Customer installation and execution MUST continue not to require Node, npm, pnpm, Cargo, rustc, or
a system SQLite installation. Release artifacts MUST be built for every supported platform by the
controlled release workflow from a pinned Rust toolchain and committed `Cargo.lock`. Each release
MUST publish the platform binaries, cryptographic checksums, GitHub build-provenance attestation
bundles, and an SBOM. Package-manager formulas may install those exact artifacts, but they must not
rebuild the CLI or resolve its implementation dependencies on the customer's machine. npm is not a
canonical distribution channel; any future npm compatibility package requires a separate decision
and must not handle credentials or Sensitive Values.

GitHub build provenance is the canonical portable artifact-authentication mechanism. Every binary
must be attested by the pinned `actions/attest-build-provenance` step in
`.github/workflows/cli-release.yml`, bound to `zaks-io/insecur`, that workflow, and the verified
source SHA. The POSIX and Windows installers MUST verify the downloaded binary with
`gh attestation verify --repo zaks-io/insecur --signer-workflow
zaks-io/insecur/.github/workflows/cli-release.yml` using its published attestation bundle, then
verify the binary against `SHA256SUMS`, before installation. Missing or invalid provenance or a
checksum mismatch fails closed. Platform-native code signing and notarization remain additive
controls; they do not replace portable provenance verification.

This mechanism uses GitHub's attestation trust service and workflow identity rather than an
insecur-held portable signing key, so there is no project signing key to rotate. A change to the
repository identity, workflow path, attestation provider, or installer verifier is a trust-root
change and requires an ADR amendment plus a lockstep installer update. If a release artifact or its
build identity is compromised, operators remove that release from the supported install path,
publish a replacement release and advisory, and do not weaken installer verification to preserve
availability.

The Rust dependency graph is governed as reviewed source, not as an opaque implementation detail:

- Registry dependencies are exact through the committed lockfile; git dependencies are forbidden.
- Release builds use vendored dependency sources and run locked, offline, and without registry
  network access.
- Default features are disabled unless reviewed and required. Duplicate versions require an
  explicit exception.
- Third-party build scripts and procedural macros are denied by default and require a narrow,
  documented allowlist because they execute inside the build trust boundary.
- Every normal, build, and procedural-macro dependency must satisfy the repository's recorded
  `cargo vet` policy for deployment. Known advisories, forbidden sources, and forbidden licenses
  fail CI through RustSec-backed auditing and dependency policy checks.
- The built binary embeds enough dependency metadata to map a released artifact back to its exact
  dependency graph. The release SBOM and provenance carry the same release identity.
- First-party CLI code forbids `unsafe` by default. A platform adapter that cannot avoid `unsafe`
  requires a narrowly scoped module, a written safety invariant, and focused tests.

Dependency count is a review signal, not the security claim. TLS, JSON, URL parsing, SQLite,
cryptography, secure randomness, argument parsing, and platform APIs may use external crates when
implementing them locally would increase risk. A new dependency is accepted only when its required
capability, transitive graph, build-time behavior, maintenance posture, and alternatives are
recorded in the change that adds it. Frameworks and general abstractions are not accepted merely
for convenience when a small first-party module or the standard library is sufficient.

The migration is contract-first. Before porting commands, a compatibility harness must capture the
observable TypeScript CLI contract. It runs both binaries against shared fake-API, filesystem, and
process fixtures and compares:

- stdout, stderr, exit status, human output, and metadata-only JSON envelopes;
- HTTP methods, paths, headers, request bodies, host validation, and authentication behavior;
- configuration contents, paths, permissions, session sealing, and key-store selection;
- child-process arguments, environment construction, signal forwarding, injection-grant
  consumption, completion reporting, and cleanup; and
- no-plaintext, redaction, one-use, local-custody, and crash-report sanitization behavior.

The Rust binary may replace internal structure and may recreate the prelaunch local SQLite schema,
but it must preserve the product contracts owned by the specs and existing CLI ADRs. Cutover occurs
only when the native binary passes the compatibility suite, the ordinary CLI unit and integration
suite, supported-platform packaging smoke, and the existing First Value preview smoke. During
transition, new CLI behavior must either land in both implementations or be delayed until the Rust
implementation owns the command; an undocumented long-lived split is not allowed.

## Considered Options

- **Keep the Bun-compiled TypeScript CLI and rely only on ADR-0056.** Rejected as the long-term
  customer boundary: the existing native distribution and provenance controls are sound, but the
  shipped custody tool still embeds the JavaScript runtime and its release build still resolves the
  npm/pnpm dependency graph.
- **Compile the JavaScript CLI into a native-looking executable.** Rejected: it improves
  installation ergonomics but retains the JavaScript runtime and most of the same build dependency
  graph while obscuring rather than removing that trust boundary.
- **A zero-dependency Rust binary.** Rejected: implementing TLS, cryptography, URL parsing, and
  SQLite bindings locally would increase security and interoperability risk. Dependencies are
  minimized, pinned, vendored, audited, and made visible instead.
- **A flag-day rewrite.** Rejected: the CLI already has a broad security-sensitive behavioral
  contract. Parallel compatibility evidence is required before changing the delivered binary.
- **Go instead of Rust.** Rejected for this custody boundary: Go would provide a strong standard
  library and a simpler dependency graph, but Rust gives tighter control over ownership,
  secret-bearing buffer lifetime, zeroization, and platform-native integration without a garbage
  collected runtime. This is a boundary-specific choice, not a repository-wide language policy.

## Consequences

- Customers retain the existing verified native installation path while the shipped binary drops
  the embedded JavaScript runtime and the release build moves to a smaller controlled input graph.
- Trust claims can point to installer-enforced provenance, checksums, an SBOM, and a reviewed
  dependency graph rather than to Rust as a brand or to dependency count alone.
- The repository temporarily carries two CLI implementations and a compatibility harness. This is
  intentional migration cost and must end at cutover.
- CLI feature work slows while shared behavior must remain compatible. Security fixes continue to
  land in the delivered TypeScript CLI until cutover.
- Release engineering expands to a supported-platform build matrix, signing, provenance, SBOM
  publication, and artifact-install smoke tests.
- Cargo's transitive graph, build scripts, procedural macros, and native code remain supply-chain
  inputs. Moving compilation into controlled CI concentrates the risk; it does not erase it.
- ADR-0056 remains in force for the TypeScript/Cloudflare monorepo and for the CLI until cutover.
  This ADR does not authorize weakening pnpm controls.
