import type { ErrorRemediation, MetadataEnvelopeMeta } from "@insecur/domain";

export interface CliErrorOptions {
  readonly exitCode?: number;
  readonly meta?: MetadataEnvelopeMeta;
  readonly remediation?: ErrorRemediation;
  readonly data?: Record<string, unknown>;
}

export function resolveCliErrorOptions(
  exitCodeOrOptions?: number | CliErrorOptions,
  legacyData?: Record<string, unknown>,
): CliErrorOptions {
  if (typeof exitCodeOrOptions === "number") {
    return {
      exitCode: exitCodeOrOptions,
      ...(legacyData !== undefined ? { data: legacyData } : {}),
    };
  }
  if (exitCodeOrOptions === undefined) {
    return legacyData === undefined ? {} : { data: legacyData };
  }
  return exitCodeOrOptions;
}
