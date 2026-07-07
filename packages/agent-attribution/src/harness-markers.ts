/** Known agent-harness environment markers mapped to stable harness codes. */
export const KNOWN_HARNESS_MARKERS: Readonly<
  Record<string, { readonly envValue: string; readonly harnessCode: string }>
> = {
  CLAUDECODE: {
    envValue: "1",
    harnessCode: "agent.harness.claude_code",
  },
  CURSOR_AGENT: {
    envValue: "1",
    harnessCode: "agent.harness.cursor",
  },
  CURSOR_TRACE_ID: {
    envValue: "*",
    harnessCode: "agent.harness.cursor",
  },
};
