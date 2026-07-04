import type { SecurityEvidenceBundle } from "./types.js";
import { collectSecurityCheckControls } from "./collect-controls.js";
import { EVIDENCE_BUNDLE_SCHEMA_VERSION } from "./types.js";
import type { AssembleSecurityEvidenceBundleOptions } from "./types.js";

export function deriveBundleVerdict(
  controls: SecurityEvidenceBundle["controls"],
): Pick<SecurityEvidenceBundle, "status" | "ok"> {
  const blocked = controls.some((control) => control.blocking && control.status !== "passed");

  return blocked ? { status: "blocked", ok: false } : { status: "passed", ok: true };
}

export function assembleSecurityEvidenceBundle(
  options: AssembleSecurityEvidenceBundleOptions,
): SecurityEvidenceBundle {
  const controls = collectSecurityCheckControls(
    options.evidenceDir,
    options.profile ?? "production_deploy",
  );
  const verdict = deriveBundleVerdict(controls);

  return {
    schema_version: EVIDENCE_BUNDLE_SCHEMA_VERSION,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    profile: options.profile ?? "production_deploy",
    ...verdict,
    controls,
  };
}
