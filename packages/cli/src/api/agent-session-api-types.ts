import type {
  DeriveAgentSessionData,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  RegisterAgentSessionData,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface AgentSessionApiClient {
  deriveAgentSession(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly harnessName?: string;
    readonly credentialScopes?: readonly string[];
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
    readonly ttlSeconds?: number;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<DeriveAgentSessionData>; credential: string }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  registerAgentSession(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly harnessName: string;
    readonly ancestryKey: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<RegisterAgentSessionData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
