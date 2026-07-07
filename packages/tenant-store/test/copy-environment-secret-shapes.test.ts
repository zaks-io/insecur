import { environmentId, organizationId, projectId, type VariableKey } from "@insecur/domain";
import { describe, expect, it } from "vitest";

import { copyEnvironmentSecretShapes } from "../src/secrets/copy-environment-secret-shapes.js";

describe("copyEnvironmentSecretShapes", () => {
  it("inserts shape rows without current versions", async () => {
    const org = organizationId.brand("org_00000000000000000000000001");
    const project = projectId.brand("prj_00000000000000000000000001");
    const source = environmentId.brand("env_00000000000000000000000001");
    const target = environmentId.brand("env_00000000000000000000000002");
    const inserts: Record<string, unknown>[] = [];
    let listCall = 0;

    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => {
              listCall += 1;
              return listCall === 1 ? [{ variableKey: "API_KEY" satisfies VariableKey }] : [];
            },
          }),
        }),
      }),
      insert: () => ({
        values: async (row: Record<string, unknown>) => {
          inserts.push(row);
        },
      }),
    };

    const copied = await copyEnvironmentSecretShapes(db as never, {
      organizationId: org,
      projectId: project,
      sourceEnvironmentId: source,
      targetEnvironmentId: target,
    });

    expect(copied).toBe(1);
    expect(inserts[0]).toMatchObject({
      orgId: org,
      projectId: project,
      environmentId: target,
      variableKey: "API_KEY",
      currentVersionId: null,
    });
  });
});
