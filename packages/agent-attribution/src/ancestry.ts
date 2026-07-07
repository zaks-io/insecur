/**
 * Builds a stable process-ancestry key for Tier 2 agent-session registration. Uses parent and
 * current process identifiers so repeated invocations within the same harness subtree match.
 *
 * Note: `ppid:pid` can recur after OS PID reuse within the same human session (bounded staleness,
 * no cross-user effect); callers treat a hit as idempotent registration for that session scope.
 */
export function buildAncestryKey(): string {
  return `${String(process.ppid)}:${String(process.pid)}`;
}
