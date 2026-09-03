import type { PreviewConfig } from "../src/env";
import {
  ensureOwnerWorkspaceFixture,
  loadMemberships,
  type SmokeWorkspaceFixture,
} from "../src/smoke-fixture";
import {
  assertAuthedConsolePage,
  assertHtmlFreeOfSensitiveMaterial,
  gotoAuthedWebPage,
  useSmokeBearer,
} from "../src/web-console";
import { expect, test } from "../src/fixtures";

/**
 * Which organization the console picks when the route names none is a coin flip across Playwright
 * workers, so no test may pin it. `loadUserOrganizations` orders by Display Name
 * (`packages/access/src/load-user-organizations.ts`) and every guided organization is provisioned as
 * "My workspace" (`packages/onboarding/src/default-display-names.ts`), so the tie breaks on a random
 * org id, and each worker's `beforeAll` provisions another one. Assert instead that the console landed
 * on an organization this member belongs to, re-read now: membership only ever grows during a run, so
 * a later provision cannot invalidate the answer. Routes that name an org explicitly are unaffected.
 */
async function expectLandedOnMemberOrganization(
  landing: { label: string; pageUrl: string },
  preview: PreviewConfig,
  bearer: string,
): Promise<string> {
  const { label, pageUrl } = landing;
  const landedOrganizationId = /\/orgs\/(?<organizationId>[^/?#]+)/u.exec(pageUrl)?.groups
    ?.organizationId;
  if (landedOrganizationId === undefined) {
    throw new Error(`${label} landed on ${pageUrl}, which names no organization`);
  }
  const memberships = await loadMemberships(preview, bearer);
  expect(
    memberships.map((entry) => entry.organizationId),
    `${label} should land on an organization the member belongs to`,
  ).toContain(landedOrganizationId);
  return landedOrganizationId;
}

test.describe("preview authenticated web console @preview @happy-path", () => {
  let workspace: SmokeWorkspaceFixture;

  test.beforeAll(async ({ ownerBearer, preview }) => {
    workspace = await ensureOwnerWorkspaceFixture(preview, ownerBearer);
  });

  test.beforeEach(async ({ page, ownerBearer }) => {
    await useSmokeBearer(page, ownerBearer);
  });

  test("whoami renders session proof through the BFF", async ({ page, preview, ownerBearer }) => {
    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/whoami");
    const html = await page.content();

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web /whoami",
      expectation: {
        consoleShell: false,
        expectedText: [
          "Session proof",
          "private Service Binding call",
          preview.ownerUserId,
          "No API bearer token reached the browser",
        ],
        privateDocument: true,
      },
    });
    assertHtmlFreeOfSensitiveMaterial(html, "Web /whoami", [ownerBearer, preview.signingSecret]);
  });

  test("default /orgs resolves to the member console", async ({ page, preview, ownerBearer }) => {
    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/orgs/");
    const html = await page.content();
    const landedOrganizationId = await expectLandedOnMemberOrganization(
      { label: "Web /orgs", pageUrl: page.url() },
      preview,
      ownerBearer,
    );

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      // The switcher renders the id of the active organization only, and its panel of the rest stays
      // closed at `domcontentloaded`, so this is a check on where the console actually landed.
      label: "Web /orgs",
      expectation: {
        consoleShell: true,
        expectedText: [landedOrganizationId, ">Projects<", ">Audit<"],
      },
    });
  });

  test("org home renders the console shell", async ({ page, preview }) => {
    const response = await gotoAuthedWebPage(
      page,
      preview.webBaseUrl,
      `/orgs/${workspace.organizationId}`,
    );
    const html = await page.content();

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web org home",
      expectation: {
        consoleShell: true,
        expectedText: [
          workspace.displayName,
          workspace.organizationId,
          ">Projects<",
          ">People<",
          ">Settings<",
          "Needs you",
        ],
      },
    });
  });

  test("projects list renders project metadata", async ({ page, preview }) => {
    const response = await gotoAuthedWebPage(
      page,
      preview.webBaseUrl,
      `/orgs/${workspace.organizationId}/projects/`,
    );
    const html = await page.content();

    const expectedText = ["Projects"];
    if (workspace.projectId !== undefined && workspace.projectDisplayName !== undefined) {
      expectedText.push(workspace.projectDisplayName, workspace.projectId);
    } else {
      test.info().annotations.push({
        description:
          "Owner workspace has no project yet; asserting the empty-state invitation instead of project rows.",
        type: "web.console.projects.empty",
      });
      expectedText.push("No projects yet", "insecur init");
    }

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web projects list",
      expectation: {
        consoleShell: true,
        expectedText,
      },
    });
  });

  test("project detail and sub-views render inside the console shell", async ({
    page,
    preview,
  }) => {
    if (workspace.projectId === undefined || workspace.projectDisplayName === undefined) {
      test.skip(
        true,
        "Skipped because the owner workspace has no project; project console routes need a project fixture.",
      );
      return;
    }

    const projectBase = `/orgs/${workspace.organizationId}/projects/${workspace.projectId}`;
    const routes = [
      {
        label: "Web project environments",
        path: projectBase,
        expectedText: [
          workspace.projectDisplayName,
          workspace.projectId,
          ">Environments<",
          ">Secrets<",
          ">Access<",
          ">Delivery<",
        ],
      },
      {
        // The secrets sub-view marker renders in every state (matrix, empty Secret Shape, no
        // environments); whether the workspace has secret rows is preview-data-dependent, so the
        // old table-header fragment ">Secret<" was flaky (INS-600). Pinned by the SSR unit test in
        // apps/web/test/secrets-matrix-read.test.tsx.
        label: "Web project secrets",
        path: `${projectBase}/secrets`,
        expectedText: ["Secrets", 'data-slot="project-secrets"'],
      },
      {
        label: "Web project access",
        path: `${projectBase}/access`,
        expectedText: ["Access", "Machine identities"],
      },
      {
        label: "Web project delivery",
        path: `${projectBase}/delivery`,
        expectedText: ["Delivery", "approval evidence"],
      },
    ] as const;

    for (const route of routes) {
      const response = await gotoAuthedWebPage(page, preview.webBaseUrl, route.path);
      const html = await page.content();
      await assertAuthedConsolePage({
        response,
        pageUrl: page.url(),
        html,
        label: route.label,
        expectation: {
          consoleShell: true,
          expectedText: [...route.expectedText],
        },
      });
    }
  });

  test("audit, people, and settings sections render metadata pages", async ({ page, preview }) => {
    const routes = [
      {
        label: "Web audit",
        path: `/orgs/${workspace.organizationId}/audit`,
        expectedText: ["Audit", 'aria-label="Breadcrumb"', "Metadata-only event log"],
      },
      {
        label: "Web people",
        path: `/orgs/${workspace.organizationId}/people`,
        expectedText: ["People", "Members", "Pending invitations"],
      },
      {
        label: "Web settings",
        path: `/orgs/${workspace.organizationId}/settings`,
        expectedText: ["Settings", "Organization configuration"],
      },
    ] as const;

    for (const route of routes) {
      const response = await gotoAuthedWebPage(page, preview.webBaseUrl, route.path);
      const html = await page.content();
      await assertAuthedConsolePage({
        response,
        pageUrl: page.url(),
        html,
        label: route.label,
        expectation: {
          consoleShell: true,
          expectedText: [...route.expectedText],
        },
      });
    }
  });

  test("onboarding redirects members who already belong to an organization", async ({
    page,
    preview,
    ownerBearer,
  }) => {
    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/onboarding");
    const html = await page.content();
    const landedOrganizationId = await expectLandedOnMemberOrganization(
      { label: "Members with an org leaving /onboarding", pageUrl: page.url() },
      preview,
      ownerBearer,
    );

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web /onboarding redirect",
      expectation: {
        consoleShell: true,
        expectedText: [landedOrganizationId],
      },
    });
  });

  test("onboarding handoff reopens when org, project, and env fixtures exist", async ({
    page,
    preview,
  }) => {
    if (
      workspace.projectId === undefined ||
      workspace.environmentId === undefined ||
      workspace.projectDisplayName === undefined
    ) {
      test.skip(
        true,
        "Skipped because the owner workspace lacks a complete org/project/env triple for the CLI handoff view.",
      );
      return;
    }

    const handoff = new URL("/onboarding", preview.webBaseUrl);
    handoff.searchParams.set("org", workspace.organizationId);
    handoff.searchParams.set("project", workspace.projectId);
    handoff.searchParams.set("env", workspace.environmentId);

    const response = await page.goto(handoff.toString(), { waitUntil: "domcontentloaded" });
    const html = await page.content();

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web onboarding handoff",
      expectation: {
        consoleShell: false,
        expectedText: [
          workspace.displayName,
          workspace.projectDisplayName,
          workspace.environmentId,
          "insecur run",
        ],
        privateDocument: true,
      },
    });
  });
});

test.describe("preview logout CSRF gate @preview", () => {
  test("POST /logout without a CSRF token fails closed with 403", async ({ page, preview }) => {
    const response = await page.request.post(`${preview.webBaseUrl}/logout`, {
      failOnStatusCode: false,
      maxRedirects: 0,
      form: {},
    });
    if (response.status() !== 403) {
      throw new Error(
        `Web /logout without CSRF returned ${String(response.status())}, expected 403`,
      );
    }
  });
});

test.describe("preview onboarding entry for org-less smoke actor @preview @happy-path", () => {
  test.beforeEach(async ({ page, noScopeBearer }) => {
    await useSmokeBearer(page, noScopeBearer);
  });

  test("org-less admitted actor reaches the onboarding wizard", async ({
    page,
    preview,
    noScopeBearer,
  }) => {
    const memberships = await loadMemberships(preview, noScopeBearer);
    if (memberships.length > 0) {
      test.skip(
        true,
        "Skipped because the no-scope smoke actor unexpectedly has organization memberships in preview.",
      );
      return;
    }

    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/onboarding");
    const html = await page.content();

    await assertAuthedConsolePage({
      response,
      pageUrl: page.url(),
      html,
      label: "Web /onboarding wizard",
      expectation: {
        consoleShell: false,
        expectedText: ["Name your organization", "Personal Organization"],
        privateDocument: true,
      },
    });
    assertHtmlFreeOfSensitiveMaterial(html, "Web /onboarding wizard", [
      noScopeBearer,
      preview.signingSecret,
    ]);
  });
});
