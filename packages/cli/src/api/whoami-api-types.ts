import type {
  AgentSessionId,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SessionWhoamiData,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface WhoamiApiClient {
  sessionWhoami(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
    readonly agentSessionId?: AgentSessionId;
    readonly agentTag?: string;
    readonly harnessName?: string;
    readonly ancestryKey?: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<SessionWhoamiData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
