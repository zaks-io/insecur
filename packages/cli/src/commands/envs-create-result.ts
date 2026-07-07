import { successEnvelope, type RequestId } from "@insecur/domain";
import type { CreateEnvironmentData } from "../api/navigation-api-types.js";
import { asEchoId, buildEnvelopeMeta } from "../output/target-echo.js";

export function buildCreateEnvironmentOutput(
  data: CreateEnvironmentData,
  requestId: RequestId | undefined,
) {
  return successEnvelope(
    {
      environmentId: data.environmentId,
      organizationId: data.organizationId,
      projectId: data.projectId,
      displayName: data.displayName,
      lifecycleStage: data.lifecycleStage,
      isProtected: data.isProtected,
      createdAt: data.createdAt,
      copiedShapeCount: data.copiedShapeCount,
    },
    buildEnvelopeMeta({
      requestId,
      resolvedTargets: [
        {
          type: "environment",
          id: asEchoId(data.environmentId),
          displayName: data.displayName,
          parent: {
            type: "project",
            id: asEchoId(data.projectId),
            parent: { type: "organization", id: asEchoId(data.organizationId) },
          },
        },
      ],
    }),
  );
}
