function appendOption(argv: string[], name: string, value: string | undefined): void {
  if (value !== undefined) {
    argv.push(name, value);
  }
}

function appendFlag(argv: string[], name: string, enabled: boolean): void {
  if (enabled) {
    argv.push(name);
  }
}

export function runPolicyCreateResumeArgv(
  options: {
    readonly policyId: string;
    readonly envId: string;
    readonly command: string;
    readonly commandFingerprint: string | undefined;
    readonly secretIds: string;
  },
  operationId: string,
): readonly string[] {
  const argv = [
    "insecur",
    "run-policies",
    "create",
    "--policy-id",
    options.policyId,
    "--env-id",
    options.envId,
    "--display-name-stdin",
    "--command",
    options.command,
  ];
  appendOption(argv, "--command-fingerprint", options.commandFingerprint);
  argv.push("--secret-ids", options.secretIds, "--operation", operationId, "--json");
  return argv;
}

export function connectionCreateResumeArgv(
  options: {
    readonly provider: string;
    readonly connectionId: string;
    readonly method: string;
    readonly valueStdin: boolean;
    readonly allowAccountId: string | undefined;
    readonly allowWorkerScript: string | undefined;
    readonly installationId: string | undefined;
    readonly owner: string | undefined;
    readonly allowedRepositories: string | undefined;
  },
  operationId: string,
): readonly string[] {
  const argv = [
    "insecur",
    "connections",
    "create",
    options.provider,
    "--connection-id",
    options.connectionId,
    "--method",
    options.method,
    "--display-name-stdin",
  ];
  appendFlag(argv, "--value-stdin", options.valueStdin);
  appendOption(argv, "--allow-account-id", options.allowAccountId);
  appendOption(argv, "--allow-worker-script", options.allowWorkerScript);
  appendOption(argv, "--installation-id", options.installationId);
  appendOption(argv, "--owner", options.owner);
  appendOption(argv, "--allowed-repositories", options.allowedRepositories);
  argv.push("--operation", operationId, "--json");
  return argv;
}

export function connectionRotateResumeArgv(
  connectionId: string,
  dryRun: boolean,
  operationId: string,
): readonly string[] {
  const argv = ["insecur", "connections", "rotate", connectionId];
  argv.push(dryRun ? "--dry-run" : "--value-stdin", "--operation", operationId, "--json");
  return argv;
}
