import type {
  EnvironmentId,
  MembershipId,
  OrganizationId,
  ProjectId,
  TeamId,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface GuidedOrganizationProvisionData {
  readonly organizationId: OrganizationId;
  readonly defaultTeamId: TeamId;
  readonly ownerMembershipId: MembershipId;
  readonly projectId: ProjectId;
  readonly developmentEnvironmentId: EnvironmentId;
}

export interface OnboardingApiClient {
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
