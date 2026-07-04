/**
 * Negative lint fixture representing an unallowlisted backup-restore sibling module.
 * Must fail eslint decrypt-import boundary; see decrypt-import-boundary.test.ts.
 */
import { decryptSecretValueForRuntime } from "@insecur/crypto";

export function backupRestoreSiblingDecryptImport(): typeof decryptSecretValueForRuntime {
  return decryptSecretValueForRuntime;
}
