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
