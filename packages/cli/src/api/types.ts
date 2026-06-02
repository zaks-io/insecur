import type {
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

export interface CliSessionExchangeData {
  readonly sessionId: string;
  readonly expiresAt: string;
}

export interface GuidedOrganizationProvisionData {
  readonly organizationId: OrganizationId;
  readonly defaultTeamId: TeamId;
  readonly ownerMembershipId: MembershipId;
  readonly projectId: ProjectId;
  readonly developmentEnvironmentId: EnvironmentId;
}

export type ApiSuccess<T> = SuccessEnvelope<T>;
export type ApiFailure = ErrorEnvelope;

export interface ApiClient {
  exchangeCliSession(input: {
    readonly host: string;
    readonly cookieHeader: string;
    readonly csrfHeader?: string;
  }): Promise<
    | { ok: true; credential: string; envelope: ApiSuccess<CliSessionExchangeData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  provisionPersonalOrganization(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId?: OrganizationId;
    readonly projectId?: ProjectId;
    readonly environmentId?: EnvironmentId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<GuidedOrganizationProvisionData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
