import type { ReleaseGateControl } from "./types.js";
import { collectChecklistControls } from "./collect-checklist-controls.js";
import {
  collectDependencyScanControl,
  collectSbomVulnerabilityControl,
  collectSecretScanControl,
  collectVerifyControl,
} from "./collect-supply-chain-controls.js";

export { collectChecklistControl, collectChecklistControls } from "./collect-checklist-controls.js";
export {
  collectDependencyScanControl,
  collectSbomVulnerabilityControl,
  collectSecretScanControl,
  collectVerifyControl,
} from "./collect-supply-chain-controls.js";

export function collectSecurityCheckControls(evidenceDir: string): ReleaseGateControl[] {
  return [
    collectVerifyControl(evidenceDir),
    collectDependencyScanControl(evidenceDir),
    collectSecretScanControl(evidenceDir),
    collectSbomVulnerabilityControl(evidenceDir),
    ...collectChecklistControls(evidenceDir),
  ];
}
