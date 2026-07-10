import { CliError } from "../output/cli-error.js";

const CAPABILITY_SCOPES = {
  "secrets:list": ["secret:read"],
  "secrets:set": ["secret:read", "secret:non_protected_write"],
  run: [
    "secret:read",
    "runtime_injection:grant_issue",
    "runtime_injection:grant_consume",
    "runtime_injection:run",
  ],
  "operations:cancel": ["operation:cancel"],
} as const;

export interface AgentSessionPolicyOptions {
  readonly allow?: readonly string[];
  readonly ttlSeconds?: number;
}

export function parseAgentAllow(value: string | undefined): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const capabilities = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  if (capabilities.length === 0) {
    throw new CliError({
      code: "validation.invalid_command_input",
      message: "--allow requires at least one capability.",
      retryable: false,
    });
  }
  for (const capability of capabilities) {
    if (!(capability in CAPABILITY_SCOPES)) {
      throw new CliError({
        code: "validation.invalid_command_input",
        message: `Unknown agent capability ${capability}. Use: ${Object.keys(CAPABILITY_SCOPES).join(", ")}.`,
        retryable: false,
      });
    }
  }
  return capabilities;
}

export function parseAgentTtl(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const ttl = Number(value);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 86_400) {
    throw new CliError({
      code: "validation.invalid_command_input",
      message: "--ttl must be a whole number of seconds from 60 to 86400.",
      retryable: false,
    });
  }
  return ttl;
}

export function credentialScopesForCapabilities(
  capabilities: readonly string[] | undefined,
): readonly string[] | undefined {
  if (capabilities === undefined) {
    return undefined;
  }
  const scopes = new Set<string>();
  for (const capability of capabilities) {
    for (const scope of CAPABILITY_SCOPES[capability as keyof typeof CAPABILITY_SCOPES]) {
      scopes.add(scope);
    }
  }
  return [...scopes];
}
