import { closeRuntimeSql } from "@insecur/tenant-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { integrationDatabaseReady } from "../../../tenant-store/test/rls/integration-database-ready.js";
import { seedTenantBaseline } from "../../../tenant-store/test/rls/seed.js";
import {
  TEST_ENV_A_ID,
  TEST_ORG_A_ID,
  TEST_PROJECT_A_ID,
  TEST_USER_ID,
} from "../../../tenant-store/test/rls/test-ids.js";
import {
  createCliIntegrationHarness,
  type CliIntegrationHarness,
  type CliProcessResult,
} from "./postgres-cli-harness.js";

const describeIntegration = integrationDatabaseReady ? describe : describe.skip;

const NODE_SQLITE_WARNING =
  /^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time$/;
const NODE_TRACE_WARNING =
  /^\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)$/;

function stripAllowedRuntimeWarnings(output: string): string {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) => line !== "" && !NODE_SQLITE_WARNING.test(line) && !NODE_TRACE_WARNING.test(line),
    )
    .join("\n");
}

function parseJsonOutput(result: CliProcessResult): unknown {
  expect(result.code).toBe(0);
  expect(stripAllowedRuntimeWarnings(result.stderr)).toBe("");
  return JSON.parse(result.stdout.trim());
}

function expectMetadataOnlyOutput(output: unknown): void {
  expect(JSON.stringify(output)).not.toMatch(/credential|token|password|plaintext|secret/i);
}

describeIntegration("CLI against real Postgres", () => {
  let harness: CliIntegrationHarness;

  beforeAll(async () => {
    await seedTenantBaseline();
    harness = await createCliIntegrationHarness();
  });

  afterAll(async () => {
    await harness?.close();
    await closeRuntimeSql();
  });

  it("reports whoami through the real API and Runtime admission path", async () => {
    const result = await harness.runCli(["--org-id", TEST_ORG_A_ID, "whoami"]);
    const output = parseJsonOutput(result);

    expect(output).toMatchObject({
      ok: true,
      data: {
        actorType: "user",
        userId: TEST_USER_ID,
        sessionValid: true,
        resolvedContext: {
          organizationId: TEST_ORG_A_ID,
        },
      },
    });
    expectMetadataOnlyOutput(output);
  });

  it("lists organizations, projects, and environments from seeded Postgres", async () => {
    const orgs = parseJsonOutput(await harness.runCli(["orgs", "list"]));
    expect(orgs).toMatchObject({
      ok: true,
      data: {
        organizations: expect.arrayContaining([
          expect.objectContaining({ organizationId: TEST_ORG_A_ID }),
        ]),
      },
    });

    const projects = parseJsonOutput(
      await harness.runCli(["--org-id", TEST_ORG_A_ID, "projects", "list"]),
    );
    expect(projects).toMatchObject({
      ok: true,
      data: {
        projects: expect.arrayContaining([
          expect.objectContaining({ projectId: TEST_PROJECT_A_ID }),
        ]),
      },
    });

    const environments = parseJsonOutput(
      await harness.runCli([
        "--org-id",
        TEST_ORG_A_ID,
        "--project-id",
        TEST_PROJECT_A_ID,
        "envs",
        "list",
      ]),
    );
    expect(environments).toMatchObject({
      ok: true,
      data: {
        environments: expect.arrayContaining([
          expect.objectContaining({ environmentId: TEST_ENV_A_ID }),
        ]),
      },
    });
    expectMetadataOnlyOutput({ orgs, projects, environments });
  });

  it("fails closed without a session token before touching the API", async () => {
    const result = await harness.runCli(["whoami"], { authenticated: false });
    expect(result.code).toBe(3);
    expect(result.stdout).toBe("");
    const output = JSON.parse(stripAllowedRuntimeWarnings(result.stderr));
    expect(output).toMatchObject({
      ok: false,
      error: { code: "auth.required" },
    });
    expectMetadataOnlyOutput(output);
  });
});
