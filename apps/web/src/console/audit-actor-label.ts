import type { ConsoleAuditActor, ConsoleAuditEvent } from "./audit-events.js";

function detailString(details: ConsoleAuditEvent["details"], key: string): string | undefined {
  const value = details?.[key];
  return typeof value === "string" ? value : undefined;
}

function formatBaseActor(actor: ConsoleAuditActor): string {
  if (actor.actorType === "user") {
    return actor.userId ?? "user";
  }
  if (actor.actorType === "machine") {
    return actor.machineIdentityId ?? "machine";
  }
  return "ci_exchange";
}

/**
 * Plain-text actor label for audit rows (docs/web-console-ux.md §Actor Rendering). The shared
 * principal-chain component replaces this in a later slice; Home adopts it then.
 */
export function formatConsoleAuditActorLabel(event: ConsoleAuditEvent): string {
  const agentSessionId = detailString(event.details, "agentSessionId");
  const harnessName = detailString(event.details, "harnessName");
  if (agentSessionId !== undefined && harnessName !== undefined) {
    const under =
      event.actor.actorType === "user" && event.actor.userId !== undefined
        ? ` · under ${event.actor.userId}`
        : "";
    return `agent ${agentSessionId} (${harnessName})${under}`;
  }

  const agentAttributionTag = detailString(event.details, "agentAttributionTag");
  if (event.actor.actorType === "user" && agentAttributionTag !== undefined) {
    const userLabel = event.actor.userId ?? "user";
    return `${userLabel} · via ${agentAttributionTag} (unverified)`;
  }

  return formatBaseActor(event.actor);
}
