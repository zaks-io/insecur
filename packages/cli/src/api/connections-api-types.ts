import type {
  AppConnectionId,
  DisplayName,
  ErrorEnvelope,
  OperationId,
  OrganizationId,
  SuccessEnvelope,
} from "@insecur/domain";
import type {
  CreateAppConnectionRpcPayload,
  DisconnectAppConnectionRpcPayload,
  GetAppConnectionStatusRpcPayload,
  ListAppConnectionsRpcPayload,
  ReauthAppConnectionRpcPayload,
  RotateAppConnectionCredentialRpcPayload,
} from "@insecur/worker-kit/rpc/runtime-connections-rpc-contract";

export type ListAppConnectionsData = ListAppConnectionsRpcPayload;
export type GetAppConnectionStatusData = GetAppConnectionStatusRpcPayload;
export type CreateAppConnectionData = CreateAppConnectionRpcPayload;
export type RotateAppConnectionCredentialData = RotateAppConnectionCredentialRpcPayload;
export type ReauthAppConnectionData = ReauthAppConnectionRpcPayload;
export type DisconnectAppConnectionData = DisconnectAppConnectionRpcPayload;

export interface ConnectionsApiClient {
  listAppConnections(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<ListAppConnectionsData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;

  getAppConnectionStatus(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<GetAppConnectionStatusData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;

  createAppConnection(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
    readonly provider: string;
    readonly connectionMethod: string;
    readonly displayName: DisplayName;
    readonly operationId?: OperationId;
    readonly tokenUtf8?: Uint8Array;
    readonly allowAccountId?: string;
    readonly allowWorkerScript?: string;
    readonly installationId?: string;
    readonly owner?: string;
    readonly allowedRepositories?: readonly string[];
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<CreateAppConnectionData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;

  rotateAppConnectionCredential(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
    readonly dryRun: boolean;
    readonly operationId?: OperationId;
    readonly tokenUtf8?: Uint8Array;
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<RotateAppConnectionCredentialData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;

  reauthAppConnection(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
    readonly operationId?: OperationId;
    readonly installationId?: string;
    readonly owner?: string;
    readonly allowedRepositories?: readonly string[];
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<ReauthAppConnectionData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;

  disconnectAppConnection(input: {
    readonly host: string;
    readonly bearerCredential: string;
    readonly organizationId: OrganizationId;
    readonly appConnectionId: AppConnectionId;
  }): Promise<
    | { ok: true; envelope: SuccessEnvelope<DisconnectAppConnectionData> }
    | { ok: false; envelope: ErrorEnvelope; httpStatus: number }
  >;
}
