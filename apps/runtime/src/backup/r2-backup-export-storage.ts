import {
  BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY,
  type BackupExportStorage,
} from "@insecur/backup-restore";

/** R2 adapter for the backup export/restore storage seam (ADR-0072/0084). */
export function createR2BackupExportStorage(bucket: R2Bucket): BackupExportStorage {
  return {
    async putArtifact(key, body) {
      const written = await bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" } });
      if (written === null) {
        throw new Error(`immutable backup artifact already exists at ${key}`);
      }
    },
    async putEvidence(key, body) {
      const written = await bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" } });
      if (written === null) {
        throw new Error(`immutable backup evidence already exists at ${key}`);
      }
    },
    async putLatestEvidence(body) {
      await bucket.put(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY, body);
    },
    async getArtifact(key) {
      const object = await bucket.get(key);
      return object === null ? null : new Uint8Array(await object.arrayBuffer());
    },
    async getEvidence(key) {
      const object = await bucket.get(key);
      return object === null ? null : await object.text();
    },
    async getLatestEvidence() {
      const object = await bucket.get(BACKUP_EXPORT_SUCCESS_EVIDENCE_KEY);
      return object === null ? null : await object.text();
    },
  };
}
