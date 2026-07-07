import {
  agentSessionId,
  userId,
  type AgentSessionId,
  type AttributionTier,
  type UserId,
} from "@insecur/domain";
import { withTenantScope } from "@insecur/tenant-store";

interface AgentSessionRow {
  readonly id: string;
  readonly user_id: string;
  readonly human_session_id: string;
  readonly harness_name: string;
  readonly ancestry_key: string;
  readonly tier: string;
}

export interface ActiveAgentSession {
  readonly id: AgentSessionId;
  readonly userId: UserId;
  readonly humanSessionId: string;
  readonly harnessName: string;
  readonly ancestryKey: string;
  readonly tier: AttributionTier;
}

function toActiveAgentSession(row: AgentSessionRow): ActiveAgentSession {
  return {
    id: agentSessionId.brand(row.id),
    userId: userId.brand(row.user_id),
    humanSessionId: row.human_session_id,
    harnessName: row.harness_name,
    ancestryKey: row.ancestry_key,
    tier: row.tier as AttributionTier,
  };
}

export async function findActiveAgentSession(input: {
  readonly humanSessionId: string;
  readonly userId: UserId;
  readonly agentSessionId?: AgentSessionId;
  readonly ancestryKey?: string;
}): Promise<ActiveAgentSession | null> {
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    if (input.agentSessionId !== undefined) {
      return await sql<AgentSessionRow[]>`
        SELECT id, user_id, human_session_id, harness_name, ancestry_key, tier
        FROM agent_sessions
        WHERE id = ${input.agentSessionId}
          AND human_session_id = ${input.humanSessionId}
          AND user_id = ${input.userId}
          AND closed_at IS NULL
        LIMIT 1
      `;
    }
    if (input.ancestryKey !== undefined) {
      return await sql<AgentSessionRow[]>`
        SELECT id, user_id, human_session_id, harness_name, ancestry_key, tier
        FROM agent_sessions
        WHERE human_session_id = ${input.humanSessionId}
          AND user_id = ${input.userId}
          AND ancestry_key = ${input.ancestryKey}
          AND closed_at IS NULL
        LIMIT 1
      `;
    }
    return [];
  });

  const row = rows[0];
  return row === undefined ? null : toActiveAgentSession(row);
}

export async function registerAgentSession(input: {
  readonly humanSessionId: string;
  readonly userId: UserId;
  readonly harnessName: string;
  readonly ancestryKey: string;
}): Promise<AgentSessionId> {
  const candidateId = agentSessionId.generate();
  const rows = await withTenantScope({ kind: "service" }, async ({ sql }) => {
    await sql`
      INSERT INTO agent_sessions (
        id,
        user_id,
        human_session_id,
        harness_name,
        ancestry_key,
        tier
      )
      VALUES (
        ${candidateId},
        ${input.userId},
        ${input.humanSessionId},
        ${input.harnessName},
        ${input.ancestryKey},
        ${"registered"}
      )
      ON CONFLICT (human_session_id, ancestry_key) WHERE closed_at IS NULL
      DO NOTHING
    `;
    return await sql<AgentSessionRow[]>`
      SELECT id, user_id, human_session_id, harness_name, ancestry_key, tier
      FROM agent_sessions
      WHERE human_session_id = ${input.humanSessionId}
        AND user_id = ${input.userId}
        AND ancestry_key = ${input.ancestryKey}
        AND closed_at IS NULL
      LIMIT 1
    `;
  });

  const row = rows[0];
  if (row === undefined) {
    throw new Error("registerAgentSession: active row missing after insert");
  }
  return toActiveAgentSession(row).id;
}

export interface ResolveAttributionTierInput {
  readonly humanSessionId: string;
  readonly userId: UserId;
  readonly agentMarked: boolean;
  readonly derivedAgentSessionId?: AgentSessionId;
  readonly agentSessionId?: AgentSessionId;
  readonly agentTag?: string;
  readonly harnessName?: string;
  readonly ancestryKey?: string;
}

export interface ResolveAttributionTierResult {
  readonly tier: AttributionTier;
  readonly agentSessionId?: AgentSessionId;
  readonly harnessName?: string;
  readonly tag?: string;
}

function derivedAttributionResult(
  input: ResolveAttributionTierInput,
): ResolveAttributionTierResult {
  return {
    tier: "derived",
    ...(input.derivedAgentSessionId !== undefined
      ? { agentSessionId: input.derivedAgentSessionId }
      : {}),
    ...(input.harnessName !== undefined ? { harnessName: input.harnessName } : {}),
  };
}

function registeredAttributionResult(session: ActiveAgentSession): ResolveAttributionTierResult {
  return {
    tier: "registered",
    agentSessionId: session.id,
    harnessName: session.harnessName,
  };
}

async function resolveRegisteredById(
  input: ResolveAttributionTierInput,
): Promise<ResolveAttributionTierResult | null> {
  if (input.agentSessionId === undefined) {
    return null;
  }
  const registered = await findActiveAgentSession({
    humanSessionId: input.humanSessionId,
    userId: input.userId,
    agentSessionId: input.agentSessionId,
  });
  return registered === null ? null : registeredAttributionResult(registered);
}

async function resolveRegisteredByAncestry(
  input: ResolveAttributionTierInput,
): Promise<ResolveAttributionTierResult | null> {
  if (input.ancestryKey === undefined) {
    return null;
  }
  const byAncestry = await findActiveAgentSession({
    humanSessionId: input.humanSessionId,
    userId: input.userId,
    ancestryKey: input.ancestryKey,
  });
  return byAncestry === null ? null : registeredAttributionResult(byAncestry);
}

async function autoRegisterAttribution(
  input: ResolveAttributionTierInput,
): Promise<ResolveAttributionTierResult | null> {
  const harnessName = input.harnessName?.trim();
  const ancestryKey = input.ancestryKey?.trim();
  if (
    harnessName === undefined ||
    harnessName === "" ||
    ancestryKey === undefined ||
    ancestryKey === ""
  ) {
    return null;
  }
  const registeredId = await registerAgentSession({
    humanSessionId: input.humanSessionId,
    userId: input.userId,
    harnessName,
    ancestryKey,
  });
  return {
    tier: "registered",
    agentSessionId: registeredId,
    harnessName,
  };
}

function tagOnlyAttributionResult(
  input: ResolveAttributionTierInput,
): ResolveAttributionTierResult | null {
  const tag = input.agentTag?.trim();
  if (tag === undefined || tag === "") {
    return null;
  }
  return {
    tier: "tag-only",
    tag,
    ...(input.harnessName !== undefined ? { harnessName: input.harnessName } : {}),
  };
}

export async function resolveAttributionTier(
  input: ResolveAttributionTierInput,
): Promise<ResolveAttributionTierResult> {
  if (input.agentMarked) {
    return derivedAttributionResult(input);
  }

  const byId = await resolveRegisteredById(input);
  if (byId !== null) {
    return byId;
  }

  const byAncestry = await resolveRegisteredByAncestry(input);
  if (byAncestry !== null) {
    return byAncestry;
  }

  const autoRegistered = await autoRegisterAttribution(input);
  if (autoRegistered !== null) {
    return autoRegistered;
  }

  const tagOnly = tagOnlyAttributionResult(input);
  if (tagOnly !== null) {
    return tagOnly;
  }

  return { tier: "none" };
}
