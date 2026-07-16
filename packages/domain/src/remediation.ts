/** A manifest Variable Key with no value on this machine plus the exact metadata-only fill argv. */
export interface MissingValueRemediationEntry {
  readonly variableKey: string;
  readonly argv: readonly string[];
}

/**
 * Metadata-only next-step instructions for actionable CLI/API errors.
 *
 * The command fields (`login`, `init`, `usage`, …) are argv token arrays so a
 * caller — human or agent — can run the recovery directly without parsing prose.
 * Tokens wrapped in angle brackets (for example `<variable-key>`) are
 * placeholders the caller must substitute before running the command.
 * `type` and `suggestedFix` follow RFC 9457 Problem Details: a stable per-code
 * error-type URI for machine dispatch, and a one-line plain-language fix.
 */
export interface ErrorRemediation {
  readonly approvalUrl?: string;
  readonly missingValues?: readonly MissingValueRemediationEntry[];
  readonly login?: readonly string[];
  readonly init?: readonly string[];
  readonly migrate?: readonly string[];
  readonly poll?: readonly string[];
  readonly resume?: readonly string[];
  readonly resumeActor?: "agent" | "human";
  readonly hosted?: readonly string[];
  readonly secretsSet?: readonly string[];
  readonly type?: string;
  readonly suggestedFix?: string;
  readonly usage?: readonly string[];
}

export type NextAction =
  | {
      readonly id: string;
      readonly actor: "agent" | "human";
      readonly kind: "execute" | "wait";
      readonly argv: readonly string[];
      readonly until?: string;
    }
  | {
      readonly id: string;
      readonly actor: "human";
      readonly kind: "open_url";
      readonly url: string;
    };
