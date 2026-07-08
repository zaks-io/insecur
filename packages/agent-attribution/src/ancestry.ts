/**
 * Builds a stable process-ancestry key for Tier 2 agent-session registration. Uses the parent
 * process identifier (the harness/agent host) so repeated CLI invocations from the same harness
 * subtree share one key even when each run gets a fresh child pid.
 *
 * Note: the parent pid can recur after OS PID reuse within the same human session (bounded
 * staleness, no cross-user effect); callers treat a hit as idempotent registration for that scope.
 */
export function buildAncestryKey(): string {
  return String(process.ppid);
}
