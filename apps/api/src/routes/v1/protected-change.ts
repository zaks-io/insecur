import {
  handleRoute,
  parseJsonBody,
  parseOperationIdParam,
  parseSecretIdParam,
  readOptionalBoolean,
  readOptionalString,
  requireRouteParam,
  requireUserActor,
  runtimeClientFor,
  type AuthVariables,
} from "@insecur/worker-kit";
import { parsePromoteDraftSelection } from "@insecur/protected-change";
import { AUTH_ERROR_CODES, VALIDATION_ERROR_CODES } from "@insecur/domain";
import { Hono } from "hono";
import type { ApiApp, ApiEnv } from "../../env.js";
import {
  handleEnvironmentScopedUserRoute,
  runtimeClientForEnvironmentScopedRoute,
} from "./handle-environment-scoped-user-route.js";

const protectedChangeRoutes = new Hono<{ Bindings: ApiEnv; Variables: AuthVariables }>();

function rejectHumanApprovalSurfaceOnly(): never {
  throw Object.assign(new Error("Approval actions require the Human Approval Surface."), {
    code: AUTH_ERROR_CODES.highAssuranceRequired,
  });
}

function readDraftVersionIdStrings(body: Record<string, unknown>): readonly string[] {
  const value = body.draftVersionIds;
  if (!Array.isArray(value) || value.length === 0) {
    throw Object.assign(new Error("draftVersionIds is required."), {
      code: VALIDATION_ERROR_CODES.invalidCommandInput,
    });
  }
  return value.map((entry) => {
    if (typeof entry !== "string") {
      throw Object.assign(new Error("draftVersionIds entries must be strings."), {
        code: VALIDATION_ERROR_CODES.invalidOpaqueResourceId,
      });
    }
    return entry;
  });
}

protectedChangeRoutes.post(
  "/:projectId/environments/:environmentId/promote",
  requireUserActor,
  async (context) =>
    handleEnvironmentScopedUserRoute(context, async (scope) => {
      const body = parseJsonBody(await context.req.json());
      const operationIdRaw = readOptionalString(body, "operationId");
      const impactReviewFingerprintRaw = readOptionalString(body, "impactReviewFingerprint");
      const commentRaw = readOptionalString(body, "comment");

      const rawDraftIds = readDraftVersionIdStrings(body);
      const selection = parsePromoteDraftSelection(rawDraftIds);
      const draftVersionIds = selection.draftVersionIds;

      return runtimeClientFor(context.env, scope.userActor).requestProtectedPromotion({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        draftVersionIds,
        requestId: scope.requestId,
        ...(commentRaw !== undefined ? { comment: commentRaw } : {}),
        ...(impactReviewFingerprintRaw !== undefined
          ? { impactReviewFingerprint: impactReviewFingerprintRaw }
          : {}),
        ...(operationIdRaw !== undefined
          ? { operationId: parseOperationIdParam(operationIdRaw) }
          : {}),
      });
    }),
);

protectedChangeRoutes.post(
  "/:projectId/environments/:environmentId/secrets/:secretId/rollback",
  requireUserActor,
  async (context) =>
    handleEnvironmentScopedUserRoute(context, async (scope) => {
      const secretId = parseSecretIdParam(
        requireRouteParam(context.req.param("secretId"), "secretId"),
      );
      const body = parseJsonBody(await context.req.json());
      const operationIdRaw = readOptionalString(body, "operationId");
      const commentRaw = readOptionalString(body, "comment");
      const toVersionRaw = body.toVersion;
      if (typeof toVersionRaw !== "number" || !Number.isInteger(toVersionRaw) || toVersionRaw < 1) {
        throw Object.assign(new Error("toVersion must be a positive integer."), {
          code: VALIDATION_ERROR_CODES.invalidCommandInput,
        });
      }

      return runtimeClientFor(context.env, scope.userActor).requestProtectedRollback({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        secretId,
        toVersionNumber: toVersionRaw,
        promoteRequested: readOptionalBoolean(body, "promote") === true,
        requestId: scope.requestId,
        ...(commentRaw !== undefined ? { comment: commentRaw } : {}),
        ...(operationIdRaw !== undefined
          ? { operationId: parseOperationIdParam(operationIdRaw) }
          : {}),
      });
    }),
);

protectedChangeRoutes.get(
  "/:projectId/environments/:environmentId/approvals",
  requireUserActor,
  async (context) =>
    handleEnvironmentScopedUserRoute(context, (scope) =>
      runtimeClientForEnvironmentScopedRoute(context).listEnvironmentApprovals({
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        environmentId: scope.environmentId,
        requestId: scope.requestId,
      }),
    ),
);

protectedChangeRoutes.post(
  "/:projectId/environments/:environmentId/approvals/:approvalId/approve",
  requireUserActor,
  async (context) =>
    handleRoute(context, () => {
      rejectHumanApprovalSurfaceOnly();
    }),
);

protectedChangeRoutes.post(
  "/:projectId/environments/:environmentId/approvals/:approvalId/reject",
  requireUserActor,
  async (context) =>
    handleRoute(context, () => {
      rejectHumanApprovalSurfaceOnly();
    }),
);

export function registerProtectedChangeRoutes(app: ApiApp): void {
  app.route("/v1/orgs/:organizationId/projects", protectedChangeRoutes);
}
