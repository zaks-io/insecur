/**
 * Builds a stable process-ancestry key for Tier 2 agent-session registration. Uses parent and
 * current process identifiers so repeated invocations within the same harness subtree match.
 */
export function buildAncestryKey(): string {
  return `${String(process.ppid)}:${String(process.pid)}`;
}
