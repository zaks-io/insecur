import type { AgentSessionId, SessionWhoamiData } from "@insecur/domain";
import type { EnvironmentId, OrganizationId, ProjectId } from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";
import { authorizedJsonRequest } from "./http-client-metadata.js";

export interface SessionWhoamiRequestInput {
  readonly bearerCredential: string;
  readonly organizationId?: OrganizationId;
  readonly projectId?: ProjectId;
  readonly environmentId?: EnvironmentId;
  readonly agentSessionId?: AgentSessionId;
  readonly agentTag?: string;
  readonly harnessName?: string;
  readonly ancestryKey?: string;
}

function appendQueryParam(params: URLSearchParams, name: string, value: string | undefined): void {
  if (value !== undefined && value.trim() !== "") {
    params.set(name, value);
  }
}

function buildWhoamiPath(input: SessionWhoamiRequestInput): string {
  const params = new URLSearchParams();
  appendQueryParam(params, "orgId", input.organizationId);
  appendQueryParam(params, "projectId", input.projectId);
  appendQueryParam(params, "envId", input.environmentId);
  appendQueryParam(params, "agentSessionId", input.agentSessionId);
  appendQueryParam(params, "agentTag", input.agentTag);
  appendQueryParam(params, "harnessName", input.harnessName);
  appendQueryParam(params, "ancestryKey", input.ancestryKey);
  const query = params.toString();
  return query === "" ? "/v1/session/whoami" : `/v1/session/whoami?${query}`;
}

export async function sessionWhoami(
  base: string,
  input: SessionWhoamiRequestInput,
): Promise<
  | { ok: true; envelope: SuccessEnvelope<SessionWhoamiData> }
  | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
> {
  return authorizedJsonRequest<SessionWhoamiData>(
    base,
    buildWhoamiPath(input),
    input.bearerCredential,
    { method: "GET" },
  );
}
