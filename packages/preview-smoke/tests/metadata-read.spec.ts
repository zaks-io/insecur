import {
  asRecord,
  assertEnvelopeData,
  assertEqual,
  assertMetadataReadEnvelope,
  assertResponseFreeOfRedactedPatterns,
  authHeaders,
  findById,
  getJson,
  invitationId,
  mintSmokeSentinel,
  postJson,
  provisionFirstValueCoords,
  redactorFor,
  requireBoolean,
  requireNullableString,
  requireNumber,
  requireObjectArray,
  requireString,
  test,
} from "../src/fixtures";

test("preview authenticated metadata read routes @preview @happy-path @metadata", async ({
  inviteeBearer,
  ownerBearer,
  preview,
}) => {
  test.setTimeout(180_000);

  const sentinel = mintSmokeSentinel();
  const redactor = redactorFor(preview, sentinel, [ownerBearer, inviteeBearer]);
  const variableKey = `SMOKE_META_${String(Date.now())}`;

  const coords = await test.step("provision.first_value", async () =>
    provisionFirstValueCoords({
      apiBaseUrl: preview.apiBaseUrl,
      bearer: ownerBearer,
      redactor,
      sentinel,
      variableKey,
    }));

  let pendingInvitationId = "";

  await test.step("invitations.create_for_list", async () => {
    pendingInvitationId = invitationId.generate();
    const body = await postJson({
      bearer: ownerBearer,
      body: {
        invitationId: pendingInvitationId,
        inviteeUserId: preview.inviteeUserId,
        projectId: coords.projectId,
        rolePreset: "developer",
      },
      label: "Invitation create",
      redactor,
      url: `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations`,
    });
    const data = assertEnvelopeData(body, "Invitation create");
    assertEqual(data.invitationId, pendingInvitationId, "Invitation create invitationId");
  });

  await test.step("session.memberships", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/session/memberships`,
      "Session memberships",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Session memberships");
    const data = assertMetadataReadEnvelope(body, "Session memberships");
    const organizations = requireObjectArray(
      data.organizations,
      "Session memberships organizations",
    );
    const membership = findById(
      organizations,
      "organizationId",
      coords.organizationId,
      "Session memberships",
    );
    requireString(membership.displayName, "Session membership displayName");
  });

  await test.step("projects.list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects`,
      "Project list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Project list");
    const data = assertMetadataReadEnvelope(body, "Project list");
    const projects = requireObjectArray(data.projects, "Project list projects");
    const project = findById(projects, "projectId", coords.projectId, "Project list");
    assertEqual(project.organizationId, coords.organizationId, "Project list organizationId");
    requireString(project.displayName, "Project list displayName");
    requireString(project.createdAt, "Project list createdAt");
  });

  await test.step("environments.list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/environments`,
      "Environment list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Environment list");
    const data = assertMetadataReadEnvelope(body, "Environment list");
    const environments = requireObjectArray(data.environments, "Environment list environments");
    const environment = findById(
      environments,
      "environmentId",
      coords.environmentId,
      "Environment list",
    );
    assertEqual(
      environment.organizationId,
      coords.organizationId,
      "Environment list organizationId",
    );
    assertEqual(environment.projectId, coords.projectId, "Environment list projectId");
    requireString(environment.displayName, "Environment list displayName");
    requireString(environment.lifecycleStage, "Environment list lifecycleStage");
    requireBoolean(environment.isProtected, "Environment list isProtected");
    requireString(environment.createdAt, "Environment list createdAt");
  });

  await test.step("secrets.matrix", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/projects/${coords.projectId}/secrets`,
      "Secrets matrix",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Secrets matrix");
    const data = assertMetadataReadEnvelope(body, "Secrets matrix");
    const environments = requireObjectArray(data.environments, "Secrets matrix environments");
    findById(environments, "environmentId", coords.environmentId, "Secrets matrix environments");

    const rows = requireObjectArray(data.rows, "Secrets matrix rows");
    const row = findById(rows, "variableKey", variableKey, "Secrets matrix rows");
    const cells = requireObjectArray(row.cells, "Secrets matrix cells");
    const cell = findById(cells, "environmentId", coords.environmentId, "Secrets matrix cells");
    requireBoolean(cell.present, "Secrets matrix cell present");
    requireString(cell.secretId, "Secrets matrix cell secretId");
    requireString(cell.secretVersionId, "Secrets matrix cell secretVersionId");
    requireNumber(cell.versionNumber, "Secrets matrix cell versionNumber");
    requireString(cell.lifecycleState, "Secrets matrix cell lifecycleState");
    requireString(cell.lastSetAt, "Secrets matrix cell lastSetAt");
    const lastSetActor = asRecord(cell.lastSetActor, "Secrets matrix cell lastSetActor");
    requireString(lastSetActor.actorType, "Secrets matrix lastSetActor type");
  });

  await test.step("audit_events.list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/audit-events?pageSize=25`,
      "Audit events list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Audit events list");
    const data = assertMetadataReadEnvelope(body, "Audit events list");
    const events = requireObjectArray(data.events, "Audit events list events");
    if (events.length === 0) {
      throw new Error("Audit events list returned no tenant-scoped events.");
    }
    for (const [index, event] of events.entries()) {
      assertEqual(
        event.organizationId,
        coords.organizationId,
        `Audit event ${String(index)} organizationId`,
      );
      requireString(event.auditEventId, `Audit event ${String(index)} auditEventId`);
      requireString(event.eventCode, `Audit event ${String(index)} eventCode`);
      requireString(event.outcome, `Audit event ${String(index)} outcome`);
      requireString(event.resultCode, `Audit event ${String(index)} resultCode`);
      requireString(event.createdAt, `Audit event ${String(index)} createdAt`);
    }
  });

  await test.step("members.list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/members`,
      "Members list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Members list");
    const data = assertMetadataReadEnvelope(body, "Members list");
    const members = requireObjectArray(data.members, "Members list members");
    const ownerMembership = findById(
      members,
      "membershipId",
      coords.ownerMembershipId,
      "Members list",
    );
    assertEqual(
      ownerMembership.organizationId,
      coords.organizationId,
      "Members list organizationId",
    );
    assertEqual(ownerMembership.userId, preview.ownerUserId, "Members list owner userId");
    requireString(ownerMembership.displayName, "Members list displayName");
    requireString(ownerMembership.rolePreset, "Members list rolePreset");
    requireNullableString(ownerMembership.projectId, "Members list projectId");
    requireString(ownerMembership.createdAt, "Members list createdAt");
  });

  await test.step("invitations.list", async () => {
    const body = await getJson(
      `${preview.apiBaseUrl}/v1/orgs/${coords.organizationId}/invitations`,
      "Invitations list",
      { headers: authHeaders(ownerBearer) },
      redactor,
    );
    assertResponseFreeOfRedactedPatterns(redactor, body, "Invitations list");
    const data = assertMetadataReadEnvelope(body, "Invitations list");
    const invitations = requireObjectArray(data.invitations, "Invitations list invitations");
    const pending = findById(invitations, "invitationId", pendingInvitationId, "Invitations list");
    assertEqual(pending.organizationId, coords.organizationId, "Invitations list organizationId");
    assertEqual(pending.inviteeUserId, preview.inviteeUserId, "Invitations list inviteeUserId");
    requireString(pending.rolePreset, "Invitations list rolePreset");
    assertEqual(pending.status, "pending", "Invitations list status");
    requireNullableString(pending.projectId, "Invitations list projectId");
    requireString(pending.createdAt, "Invitations list createdAt");
  });
});
