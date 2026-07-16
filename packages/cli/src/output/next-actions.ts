import type { ErrorRemediation, NextAction } from "@insecur/domain";

const EXECUTE_FIELDS = ["usage", "init", "migrate", "hosted", "secretsSet"] as const;

function missingValueActions(remediation: ErrorRemediation): readonly NextAction[] {
  return (remediation.missingValues ?? []).map((missing) => ({
    id: `set-value:${missing.variableKey}`,
    actor: "agent",
    kind: "execute",
    argv: missing.argv,
  }));
}

export function nextActionsFromRemediation(remediation: ErrorRemediation): readonly NextAction[] {
  const actions: NextAction[] = [];
  if (remediation.approvalUrl !== undefined) {
    actions.push({
      id: "open-approval",
      actor: "human",
      kind: "open_url",
      url: remediation.approvalUrl,
    });
  }
  if (remediation.login !== undefined) {
    actions.push({ id: "login", actor: "human", kind: "execute", argv: remediation.login });
  }
  actions.push(...missingValueActions(remediation));
  for (const field of EXECUTE_FIELDS) {
    const argv = remediation[field];
    if (argv !== undefined) {
      actions.push({ id: field, actor: "agent", kind: "execute", argv });
    }
  }
  if (remediation.poll !== undefined) {
    actions.push({ id: "poll", actor: "agent", kind: "wait", argv: remediation.poll });
  }
  if (remediation.resume !== undefined) {
    actions.push({
      id: "resume",
      actor: remediation.resumeActor ?? "agent",
      kind: "execute",
      argv: remediation.resume,
    });
  }
  return actions;
}
