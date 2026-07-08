import type {
  DisplayName,
  EnvironmentId,
  OrganizationId,
  ProjectId,
  SecretId,
  SecretVersionId,
  VariableKey,
} from "@insecur/domain";
import type { ErrorEnvelope, SuccessEnvelope } from "@insecur/domain";

type ApiSuccess<T> = SuccessEnvelope<T>;
type ApiFailure = ErrorEnvelope;

export interface SessionOrganizationListData {
  readonly organizations: readonly {
    readonly organizationId: OrganizationId;
    readonly displayName: DisplayName;
  }[];
}

export interface ProjectListData {
  readonly projects: readonly {
    readonly projectId: ProjectId;
    readonly organizationId: OrganizationId;
    readonly displayName: DisplayName;
    readonly createdAt: string;
  }[];
}

export interface EnvironmentListData {
  readonly environments: readonly {
    readonly environmentId: EnvironmentId;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly displayName: DisplayName;
    readonly lifecycleStage: string;
    readonly isProtected: boolean;
    readonly createdAt: string;
  }[];
}

export interface CreateProjectData {
  readonly projectId: ProjectId;
  readonly organizationId: OrganizationId;
  readonly displayName: DisplayName;
  readonly createdAt: string;
}

export interface CreateEnvironmentData {
  readonly environmentId: EnvironmentId;
  readonly organizationId: OrganizationId;
  readonly projectId: ProjectId;
  readonly displayName: DisplayName;
  readonly lifecycleStage: string;
  readonly isProtected: boolean;
  readonly createdAt: string;
  readonly copiedShapeCount: number;
}

export interface ListProjectSecretsData {
  readonly environments: readonly {
    readonly environmentId: EnvironmentId;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly displayName: DisplayName;
    readonly lifecycleStage: string;
    readonly isProtected: boolean;
    readonly createdAt: string;
  }[];
  readonly rows: readonly {
    readonly variableKey: VariableKey;
    readonly cells: readonly {
      readonly environmentId: EnvironmentId;
      readonly present: boolean;
      readonly secretId?: SecretId;
      readonly versionNumber?: number;
      readonly secretVersionId?: SecretVersionId;
      readonly lifecycleState?: "draft" | "live" | "retained" | "discarded";
      readonly lastSetAt?: string;
    }[];
  }[];
}

export interface NavigationApiClient {
  listSessionOrganizations(input: {
    readonly host: string;
    readonly bearerCredential: string;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<SessionOrganizationListData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listProjects(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ProjectListData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  createProject(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly displayName: DisplayName;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<CreateProjectData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listEnvironments(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<EnvironmentListData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  createEnvironment(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
    readonly environmentId: EnvironmentId;
    readonly displayName: DisplayName;
    readonly copyShapesFromEnvironmentId?: EnvironmentId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<CreateEnvironmentData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
  listProjectSecrets(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly projectId: ProjectId;
  }): Promise<
    | { ok: true; envelope: ApiSuccess<ListProjectSecretsData> }
    | { ok: false; envelope: ApiFailure; httpStatus: number }
  >;
}
