import type { ReleaseGateControl } from "./types.js";
import { collectChecklistControls } from "./collect-checklist-controls.js";
import { collectBackupRestoreControls } from "./collect-backup-restore-controls.js";
import {
  collectDependencyScanControl,
  collectSbomVulnerabilityControl,
  collectSecretScanControl,
  collectVerifyControl,
} from "./collect-supply-chain-controls.js";
import type { ReleaseGateProfile } from "./types.js";

export { collectChecklistControl } from "./collect-checklist-controls.js";
export {
  collectBackupRestoreControls,
  collectExportFreshControl,
  collectRestoreDrillControl,
} from "./collect-backup-restore-controls.js";
export {
  collectDependencyScanControl,
  collectSbomVulnerabilityControl,
  collectSecretScanControl,
  collectVerifyControl,
} from "./collect-supply-chain-controls.js";

export function collectSecurityCheckControls(
  evidenceDir: string,
  profile: ReleaseGateProfile = "production_deploy",
): ReleaseGateControl[] {
  return [
    collectVerifyControl(evidenceDir),
    collectDependencyScanControl(evidenceDir),
    collectSecretScanControl(evidenceDir),
    collectSbomVulnerabilityControl(evidenceDir),
    ...collectChecklistControls(evidenceDir),
    ...collectBackupRestoreControls(evidenceDir, profile),
  ];
}
