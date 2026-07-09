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
      page,
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

  test("default /orgs resolves to the member console", async ({ page, preview }) => {
    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/orgs/");
    const html = await page.content();

    await assertAuthedConsolePage({
      page,
      response,
      pageUrl: page.url(),
      html,
      label: "Web /orgs",
      expectation: {
        consoleShell: true,
        expectedText: [workspace.displayName, workspace.organizationId, ">Projects<", ">Audit<"],
      },
    });
    expect(page.url(), "Web /orgs should land on the default organization").toContain(
      `/orgs/${workspace.organizationId}`,
    );
  });

  test("org home renders the console shell", async ({ page, preview }) => {
    const response = await gotoAuthedWebPage(
      page,
      preview.webBaseUrl,
      `/orgs/${workspace.organizationId}`,
    );
    const html = await page.content();

    await assertAuthedConsolePage({
      page,
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
      page,
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
        label: "Web project secrets",
        path: `${projectBase}/secrets`,
        expectedText: ["Secrets", "Values never render"],
      },
      {
        label: "Web project access",
        path: `${projectBase}/access`,
        expectedText: ["Access", "Machine Identities"],
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
        page,
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
        expectedText: ["Audit", 'aria-label="Breadcrumb"', "Secret values never render"],
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
        page,
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
  }) => {
    const response = await gotoAuthedWebPage(page, preview.webBaseUrl, "/onboarding");
    const html = await page.content();

    await assertAuthedConsolePage({
      page,
      response,
      pageUrl: page.url(),
      html,
      label: "Web /onboarding redirect",
      expectation: {
        consoleShell: true,
        expectedText: [workspace.displayName],
      },
    });
    expect(page.url(), "Members with an org should leave /onboarding").toContain(
      `/orgs/${workspace.organizationId}`,
    );
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
      page,
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
      page,
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
