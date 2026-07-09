const PROOF_VARIABLE_KEY = "INSECUR_PROOF_SECRET";

export { PROOF_VARIABLE_KEY };

export function buildCliFirstValueRunArgs(verifyScript: string): readonly string[] {
  return [
    "run",
    "--variable-key",
    PROOF_VARIABLE_KEY,
    "--",
    process.execPath,
    verifyScript,
    "--json",
  ];
}

export function buildCliSecretsSetValueStdinArgs(): readonly string[] {
  return ["secrets", "set", "--variable-key", PROOF_VARIABLE_KEY, "--value-stdin"];
}

export function buildCliSecretsVersionsArgs(secretId: string): readonly string[] {
  return ["secrets", "versions", secretId];
}

export function buildCliAuditTailArgs(): readonly string[] {
  return ["audit", "tail"];
}

export function buildCliAuditExportArgs(from: string, to: string): readonly string[] {
  return ["audit", "export", "--from", from, "--to", to];
}

export function buildCliAuditVerifyArgs(
  jsonlPath: string,
  manifestPath: string,
  publishedSigningKeysUrl: string,
): readonly string[] {
  return [
    "audit",
    "verify",
    jsonlPath,
    "--manifest",
    manifestPath,
    "--published-signing-keys",
    publishedSigningKeysUrl,
  ];
}

export function buildCliOperationsGetArgs(operationId: string): readonly string[] {
  return ["operations", "get", operationId];
}

export function buildCliOperationsWaitArgs(
  operationId: string,
  timeoutSeconds?: number,
): readonly string[] {
  return timeoutSeconds === undefined
    ? ["operations", "wait", operationId]
    : ["operations", "wait", operationId, "--timeout", String(timeoutSeconds)];
}

export function buildCliRunPoliciesCreateArgs(input: {
  readonly policyId: string;
  readonly envId: string;
  readonly command: string;
  readonly secretIds: readonly string[];
}): readonly string[] {
  return [
    "run-policies",
    "create",
    "--policy-id",
    input.policyId,
    "--env-id",
    input.envId,
    "--display-name-stdin",
    "--command",
    input.command,
    "--secret-ids",
    input.secretIds.join(","),
  ];
}

export function buildCliRunPoliciesShowArgs(policyId: string): readonly string[] {
  return ["run-policies", "show", policyId];
}

export function buildCliRunPoliciesDisableArgs(input: {
  readonly policyId: string;
  readonly envId: string;
  readonly comment: string;
}): readonly string[] {
  return [
    "run-policies",
    "disable",
    input.policyId,
    "--env-id",
    input.envId,
    "--comment",
    input.comment,
  ];
}

export function buildCliAgentEnvArgs(): readonly string[] {
  return ["agent", "env"];
}

export function buildCliAgentRegisterArgs(): readonly string[] {
  return ["agent", "register"];
}

export function buildCliWhoamiArgs(): readonly string[] {
  return ["whoami"];
}
