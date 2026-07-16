import { IMPORT_ERROR_CODES, type SecretId, type VariableKey } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import { cliErrorFromEnvelope } from "../output/cli-error.js";
import {
  decryptLocalMigrateCandidate,
  type LocalMigrateSnapshot,
  type MigrateKeyCandidate,
} from "../local/migrate-local-snapshot.js";
import { buildLocalValueReport, valueMissingOnMachineError } from "../local/local-value-report.js";
import { remoteDivergedError } from "./projects-migrate-diverged-error.js";
import {
  ensureRemoteEnvironment,
  ensureRemoteProject,
  loadRemotePresence,
  scopeInput,
  type MigrateCloudTarget,
  type RemotePresence,
} from "./projects-migrate-remote.js";

export type { MigrateCloudApi, MigrateCloudTarget } from "./projects-migrate-remote.js";

export interface MigrateReconcileResult {
  readonly createdProject: boolean;
  readonly createdEnvironment: boolean;
  /** Keys written remotely this run (were absent, replayed by client-minted id). */
  readonly createdKeys: readonly VariableKey[];
  /** Keys whose remote value already matched the local candidate. */
  readonly matchedKeys: readonly VariableKey[];
  /** Diverged keys the caller explicitly skipped; the remote value is kept. */
  readonly skippedKeys: readonly VariableKey[];
}

async function checkPossession(
  target: MigrateCloudTarget,
  snapshot: LocalMigrateSnapshot,
  store: LocalStore,
  key: MigrateKeyCandidate,
): Promise<"match" | "mismatch"> {
  const candidateUtf8 = await decryptLocalMigrateCandidate(store, snapshot, key.secretId);
  const result = await target.api.checkSecretPossession({
    ...scopeInput(target),
    projectId: snapshot.projectId,
    environmentId: snapshot.environmentId,
    variableKey: key.variableKey,
    candidateUtf8,
  });
  if (!result.ok) {
    throw cliErrorFromEnvelope(result.envelope);
  }
  return result.envelope.data.verdict;
}

interface ClassifyInput {
  readonly target: MigrateCloudTarget;
  readonly snapshot: LocalMigrateSnapshot;
  readonly store: LocalStore;
  readonly presence: ReadonlyMap<VariableKey, RemotePresence>;
  readonly skipKeys: ReadonlySet<VariableKey>;
}

type KeyClass = "remote_only" | "create" | "match" | "skipped" | "diverged";

/**
 * One key's reconcile state. A key with no value on this machine must already hold a remote
 * Current Version (second-machine adopt or crash recovery); a key with a value in neither place
 * fails loud with the exact fill commands — migrate never reaches a state where a value exists
 * nowhere.
 */
async function classifyKey(input: ClassifyInput, key: MigrateKeyCandidate): Promise<KeyClass> {
  const remoteHasValue = input.presence.get(key.variableKey)?.hasCurrentVersion === true;
  if (!key.hasLocalValue) {
    if (!remoteHasValue) {
      const report = await buildLocalValueReport(
        input.store,
        input.snapshot.projectId,
        input.snapshot.environmentId,
      );
      throw valueMissingOnMachineError(key.variableKey, report);
    }
    return "remote_only";
  }
  if (!remoteHasValue) {
    return "create";
  }
  const verdict = await checkPossession(input.target, input.snapshot, input.store, key);
  if (verdict === "match") {
    return "match";
  }
  return input.skipKeys.has(key.variableKey) ? "skipped" : "diverged";
}

interface ClassifiedKeys {
  readonly toCreate: readonly MigrateKeyCandidate[];
  readonly matched: readonly VariableKey[];
  readonly skipped: readonly VariableKey[];
}

/**
 * Possession-checks every locally held value against the remote store before anything is written,
 * so the divergence path provably writes nothing.
 */
async function classifyKeys(input: ClassifyInput): Promise<ClassifiedKeys> {
  const buckets: Record<KeyClass, MigrateKeyCandidate[]> = {
    remote_only: [],
    create: [],
    match: [],
    skipped: [],
    diverged: [],
  };
  for (const key of input.snapshot.keys) {
    buckets[await classifyKey(input, key)].push(key);
  }
  if (buckets.diverged.length > 0) {
    throw remoteDivergedError(
      input.target,
      input.snapshot,
      buckets.diverged.map((key) => key.variableKey),
      "preflight",
    );
  }
  return {
    toCreate: buckets.create,
    matched: buckets.match.map((key) => key.variableKey),
    skipped: buckets.skipped.map((key) => key.variableKey),
  };
}

interface WriteKeyInput {
  readonly target: MigrateCloudTarget;
  readonly snapshot: LocalMigrateSnapshot;
  readonly store: LocalStore;
  readonly key: MigrateKeyCandidate;
  /** Remote Secret Shape id from the presence load, when a half-created shape already exists. */
  readonly remoteSecretId: SecretId | undefined;
}

/**
 * The server rejected `ifCurrentVersionAbsent` because a Current Version appeared between the
 * presence read and the write. Never retry without the guard — that is the overwrite race.
 * Instead let the possession check decide: a concurrent writer with the same value converges, a
 * different value is the divergence path.
 */
async function resolveConditionalWriteConflict(input: WriteKeyInput): Promise<void> {
  const verdict = await checkPossession(input.target, input.snapshot, input.store, input.key);
  if (verdict !== "match") {
    throw remoteDivergedError(
      input.target,
      input.snapshot,
      [input.key.variableKey],
      "post_write_verify",
    );
  }
}

/**
 * Writes one remote-absent key, replaying the local client-minted Secret id (or adopting the
 * remote shape id when a half-created shape exists), then proves the write with a fresh possession
 * check. `ifCurrentVersionAbsent` is always sent, so the no-overwrite guard is version-conditional
 * and enforced by the server atomically inside the write itself (INS-609) — a Current Version that
 * appears between the presence read and the write is never silently superseded; the resulting
 * conflict is resolved by possession verdict instead.
 */
async function writeAndVerifyKey(input: WriteKeyInput): Promise<void> {
  const valueUtf8 = await decryptLocalMigrateCandidate(
    input.store,
    input.snapshot,
    input.key.secretId,
  );
  const written = await input.target.api.writeSecretByVariableKey({
    ...scopeInput(input.target),
    projectId: input.snapshot.projectId,
    environmentId: input.snapshot.environmentId,
    variableKey: input.key.variableKey,
    secretId: input.remoteSecretId ?? input.key.secretId,
    valueUtf8,
    allowEmpty: true,
    ifCurrentVersionAbsent: true,
  });
  if (!written.ok) {
    if (written.envelope.error.code === IMPORT_ERROR_CODES.existingSecret) {
      return resolveConditionalWriteConflict(input);
    }
    throw cliErrorFromEnvelope(written.envelope);
  }
  const verdict = await checkPossession(input.target, input.snapshot, input.store, input.key);
  if (verdict !== "match") {
    throw remoteDivergedError(
      input.target,
      input.snapshot,
      [input.key.variableKey],
      "post_write_verify",
    );
  }
}

/**
 * The reconcile state machine (ADR-0080): create missing remote resources by replaying
 * client-minted ids, no-op on possession `match`, fail loud with nothing written on divergence.
 * Local state is never touched here — verified-then-clean is the caller's final step, after this
 * returns with every key accounted for remotely.
 */
export async function reconcileProjectToCloud(input: {
  readonly target: MigrateCloudTarget;
  readonly snapshot: LocalMigrateSnapshot;
  readonly store: LocalStore;
  readonly skipKeys: ReadonlySet<VariableKey>;
}): Promise<MigrateReconcileResult> {
  const createdProject = await ensureRemoteProject(input.target, input.snapshot);
  const createdEnvironment = await ensureRemoteEnvironment(input.target, input.snapshot);
  const presence = await loadRemotePresence(input.target, input.snapshot);
  const classified = await classifyKeys({ ...input, presence });
  for (const key of classified.toCreate) {
    await writeAndVerifyKey({
      target: input.target,
      snapshot: input.snapshot,
      store: input.store,
      key,
      remoteSecretId: presence.get(key.variableKey)?.secretId,
    });
  }
  return {
    createdProject,
    createdEnvironment,
    createdKeys: classified.toCreate.map((key) => key.variableKey),
    matchedKeys: classified.matched,
    skippedKeys: classified.skipped,
  };
}
