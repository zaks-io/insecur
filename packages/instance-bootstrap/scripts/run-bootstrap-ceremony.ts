/**
 * Operator entrypoint for the one-time Instance Bootstrap ceremony (INS-420).
 *
 * Runs the seed step (`runInstanceBootstrap`: instance, first Organization, Default Team,
 * Bootstrap Secret verifier, pending claim) and immediately completes the Bootstrap Operator
 * Claim for the supplied WorkOS user, which admits the operator (INS-419) so a real login
 * works afterwards. The generated Bootstrap Secret never leaves the process: it is minted,
 * consumed by the claim in the same run, and not printed.
 *
 * Inputs (environment):
 *   DATABASE_URL_RUNTIME        target database (falls back to repo .env.local for local runs)
 *   INSTANCE_ID                 e.g. inst_PREVIEW
 *   INSTANCE_DISPLAY_NAME       e.g. "insecur preview"
 *   ORGANIZATION_DISPLAY_NAME   e.g. "Zaks.io"
 *   DEFAULT_TEAM_DISPLAY_NAME   optional, defaults to "Default"
 *   OPERATOR_WORKOS_USER_ID     the operator's WorkOS user id for this environment's WorkOS env
 *   WORKOS_CLIENT_ID            the environment's WorkOS client id
 *
 * Usage: pnpm --filter @insecur/instance-bootstrap bootstrap:ceremony
 */
import { randomBytes } from "node:crypto";
import {
  membershipId,
  organizationId,
  parseDisplayName,
  requestId,
  teamId,
  userId,
  type DisplayName,
} from "@insecur/domain";
import { closeRuntimeSql, resolveAdmittedUserId } from "@insecur/tenant-store";
import { loadRepoEnvLocal } from "../../tenant-store/scripts/lib/env-local.mjs";
import {
  completeBootstrapOperatorClaim,
  getBootstrapStatus,
  isBootstrapError,
  runInstanceBootstrap,
} from "../src/index.js";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** boc_/iop_ rows are plain text ids without domain helpers; mint the same 26-char body shape. */
function mintScriptResourceId(prefix: string): string {
  const bytes = randomBytes(26);
  let body = "";
  for (const byte of bytes) {
    body += CROCKFORD_ALPHABET.charAt(byte % 32);
  }
  return `${prefix}_${body}`;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}

function requireDisplayName(name: string, fallback?: string): DisplayName {
  const raw = process.env[name]?.trim() || fallback;
  if (raw === undefined || raw === "") {
    throw new Error(`${name} is required`);
  }
  const parsed = parseDisplayName(raw);
  if (!parsed.ok) {
    throw new Error(`${name} is not a valid display name: ${parsed.code}`);
  }
  return parsed.value;
}

interface CeremonyInputs {
  readonly instanceId: string;
  readonly instanceDisplayName: DisplayName;
  readonly organizationDisplayName: DisplayName;
  readonly defaultTeamDisplayName: DisplayName;
  readonly operatorWorkosUserId: string;
  readonly workosClientId: string;
}

function readCeremonyInputs(): CeremonyInputs {
  return {
    instanceId: requireEnv("INSTANCE_ID"),
    instanceDisplayName: requireDisplayName("INSTANCE_DISPLAY_NAME"),
    organizationDisplayName: requireDisplayName("ORGANIZATION_DISPLAY_NAME"),
    defaultTeamDisplayName: requireDisplayName("DEFAULT_TEAM_DISPLAY_NAME", "Default"),
    operatorWorkosUserId: requireEnv("OPERATOR_WORKOS_USER_ID"),
    workosClientId: requireEnv("WORKOS_CLIENT_ID"),
  };
}

function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}

/** Returns true when the ceremony already ran to completion and this run is a no-op. */
async function guardExistingStatus(instanceId: string): Promise<boolean> {
  const status = await getBootstrapStatus(instanceId);
  if (status.phase === "complete") {
    writeResult({ ok: true, alreadyComplete: true, ...status });
    return true;
  }
  if (status.phase === "awaiting_operator_claim") {
    throw new Error(
      "instance has a pending operator claim from an earlier partial ceremony; its bootstrap secret " +
        "is unknown to this run. Complete that claim with the original secret or recreate the database.",
    );
  }
  return false;
}

async function runCeremony(inputs: CeremonyInputs): Promise<void> {
  const bootstrapSecret = randomBytes(32).toString("base64url");

  const seeded = await runInstanceBootstrap({
    instanceId: inputs.instanceId,
    instanceDisplayName: inputs.instanceDisplayName,
    organizationDisplayName: inputs.organizationDisplayName,
    defaultTeamDisplayName: inputs.defaultTeamDisplayName,
    resourceIds: {
      organizationId: organizationId.generate(),
      defaultTeamId: teamId.generate(),
      claimId: mintScriptResourceId("boc"),
    },
    bootstrapSecret,
    workosClientId: inputs.workosClientId,
    request: { requestId: requestId.generate() },
  });

  const claimed = await completeBootstrapOperatorClaim({
    instanceId: inputs.instanceId,
    actor: {
      type: "user",
      userId: userId.generate(),
      workosUserId: inputs.operatorWorkosUserId,
      sessionId: `bootstrap-ceremony-${requestId.generate()}`,
    },
    bootstrapSecret,
    operatorGrantId: mintScriptResourceId("iop"),
    ownerMembershipId: membershipId.generate(),
    request: { requestId: requestId.generate() },
  });

  const admittedUserId = await resolveAdmittedUserId(
    inputs.instanceId,
    inputs.operatorWorkosUserId,
  );
  if (admittedUserId === null || admittedUserId !== claimed.status.operatorUserId) {
    throw new Error("post-claim admission read-back failed: operator would not resolve at login");
  }

  writeResult({
    ok: true,
    instanceId: inputs.instanceId,
    organizationId: seeded.organizationId,
    defaultTeamId: seeded.defaultTeamId,
    operatorUserId: claimed.status.operatorUserId,
    operatorWorkosUserId: inputs.operatorWorkosUserId,
    admitted: true,
    phase: claimed.status.phase,
  });
}

async function main(): Promise<void> {
  loadRepoEnvLocal();
  const inputs = readCeremonyInputs();
  if (await guardExistingStatus(inputs.instanceId)) {
    return;
  }
  await runCeremony(inputs);
}

try {
  await main();
} catch (error) {
  const detail = isBootstrapError(error)
    ? { code: error.code, message: error.message }
    : { message: error instanceof Error ? error.message : String(error) };
  process.stderr.write(JSON.stringify({ ok: false, ...detail }) + "\n");
  process.exitCode = 1;
} finally {
  await closeRuntimeSql();
}
