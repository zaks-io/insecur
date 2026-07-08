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
