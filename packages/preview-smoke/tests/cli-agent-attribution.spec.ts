import { randomUUID } from "node:crypto";

import {
  assertCliAgentEnvMetadataOnly,
  assertCliAgentRegisterMetadataOnly,
  assertCliErrorEnvelope,
  assertCliOutputSafe,
  assertCliWhoamiAttribution,
  buildCliAgentEnvArgs,
  buildCliAgentRegisterArgs,
  buildCliWhoamiArgs,
  createCliSmokeWorkspace,
  mintBearer,
  parseCliSmokeJson,
  redactorForPreview,
  requireString,
  runCliSmokeCommand,
  runCliSmokeCommandExpectFailure,
  test,
} from "../src/fixtures";

// insecur agent register requires either a detected harness or an explicit --agent tag
// (see buildRegisterRequest); without either it fails validation before touching the API.
const EXIT_VALIDATION = 2;

// Mirrors KNOWN_HARNESS_MARKERS["CLAUDECODE"] in @insecur/agent-attribution -- setting it in the
// CLI child env makes derive/register/whoami harness detection deterministic for this spec,
// independent of whatever harness markers the process running preview smoke itself carries.
const CLAUDE_CODE_HARNESS_ENV = { CLAUDECODE: "1" };
const CLAUDE_CODE_HARNESS_CODE = "agent.harness.claude_code";

test("preview CLI agent attribution @preview @happy-path @custody", async ({ preview }) => {
  test.setTimeout(180_000);

  const sessionId = `session_preview_smoke_cli_agent_${randomUUID()}`;
  const bearer = await mintBearer({
    rawUserId: preview.ownerUserId,
    sessionId,
    signingSecret: preview.signingSecret,
    workosUserId: preview.ownerWorkosUserId,
  });
  const workspace = await createCliSmokeWorkspace();
  const redactor = redactorForPreview(preview, [bearer]);

  const humanRunInput = {
    apiBaseUrl: preview.apiBaseUrl,
    bearer,
    configDir: workspace.configDir,
    configHomeDir: workspace.configHomeDir,
    redactor,
  };

  try {
    await test.step("cli.init", async () => {
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: ["init"],
        label: "CLI init",
      });
      const body = parseCliSmokeJson(stdout, "CLI init");
      assertCliOutputSafe({ label: "CLI init", redactor, stderr, stdout });
      if (body.ok !== true) {
        throw new Error("CLI init did not succeed");
      }
    });

    await test.step("cli.whoami_no_attribution", async () => {
      // No harness marker, no --agent tag, no prior registration for this ancestry: tier "none".
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: buildCliWhoamiArgs(),
        label: "CLI whoami (no attribution)",
      });
      assertCliOutputSafe({ label: "CLI whoami (no attribution)", redactor, stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI whoami (no attribution)");
      assertCliWhoamiAttribution(body, "CLI whoami (no attribution)", "none");
    });

    let credentialFile = "";

    await test.step("cli.agent_env", async () => {
      // `agent env` rejects --json (see runAgentEnvCommand); it prints shell export lines only.
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: buildCliAgentEnvArgs(),
        extraEnv: CLAUDE_CODE_HARNESS_ENV,
        json: false,
        label: "CLI agent env",
      });
      assertCliOutputSafe({ label: "CLI agent env", redactor, stderr, stdout });
      const exports = assertCliAgentEnvMetadataOnly(stdout, "CLI agent env");
      if (exports.host !== preview.apiBaseUrl) {
        throw new Error(
          `CLI agent env exported host ${exports.host}, expected ${preview.apiBaseUrl}`,
        );
      }
      credentialFile = exports.credentialFile;
    });

    await test.step("cli.whoami_derived_via_agent_credential_file", async () => {
      // The derived agent credential is sealed on disk; the CLI resolves it from the file path
      // via INSECUR_AGENT_CREDENTIAL_FILE (see resolveAgentCredentialFromEnv), never from an
      // env-exported credential value. Drive whoami with no session token of its own so the
      // agent-file resolution path is the one under test, proving attribution is structural
      // server-side metadata rather than a trust-on-self-reported CLI flag.
      const derivedRedactor = redactorForPreview(preview, [bearer]);
      const { stdout, stderr } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: "",
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        extraEnv: { INSECUR_AGENT_CREDENTIAL_FILE: credentialFile, INSECUR_SESSION_TOKEN: "" },
        label: "CLI whoami (derived)",
        redactor: derivedRedactor,
        args: buildCliWhoamiArgs(),
      });
      assertCliOutputSafe({
        label: "CLI whoami (derived)",
        redactor: derivedRedactor,
        stderr,
        stdout,
      });
      const body = parseCliSmokeJson(stdout, "CLI whoami (derived)");
      const attribution = assertCliWhoamiAttribution(body, "CLI whoami (derived)", "derived");
      if (attribution.harnessName !== CLAUDE_CODE_HARNESS_CODE) {
        throw new Error(
          `CLI whoami (derived) expected harnessName ${CLAUDE_CODE_HARNESS_CODE}, got ${String(attribution.harnessName)}`,
        );
      }
    });

    let registeredAgentSessionId = "";

    await test.step("cli.agent_register", async () => {
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: buildCliAgentRegisterArgs(),
        extraEnv: CLAUDE_CODE_HARNESS_ENV,
        label: "CLI agent register",
      });
      assertCliOutputSafe({ label: "CLI agent register", redactor, stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI agent register");
      const data = assertCliAgentRegisterMetadataOnly(body, "CLI agent register");
      if (data.harnessName !== CLAUDE_CODE_HARNESS_CODE) {
        throw new Error(
          `CLI agent register expected harnessName ${CLAUDE_CODE_HARNESS_CODE}, got ${String(data.harnessName)}`,
        );
      }
      registeredAgentSessionId = requireString(
        data.agentSessionId,
        "CLI agent register agentSessionId",
      );
    });

    await test.step("cli.agent_register_replay_is_idempotent", async () => {
      // registerAgentSession does `ON CONFLICT (human_session_id, ancestry_key) ... DO NOTHING`
      // (packages/agent-attribution/src/agent-session-store.ts): a second register call from the
      // same process ancestry (buildAncestryKey() = process.ppid, stable across CLI invocations
      // spawned by this one test worker) must return the SAME agentSessionId, not a new one or
      // an error.
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: buildCliAgentRegisterArgs(),
        extraEnv: CLAUDE_CODE_HARNESS_ENV,
        label: "CLI agent register (replay)",
      });
      assertCliOutputSafe({ label: "CLI agent register (replay)", redactor, stderr, stdout });
      const body = parseCliSmokeJson(stdout, "CLI agent register (replay)");
      const data = assertCliAgentRegisterMetadataOnly(body, "CLI agent register (replay)");
      if (data.agentSessionId !== registeredAgentSessionId) {
        throw new Error(
          `CLI agent register (replay) expected idempotent agentSessionId ${registeredAgentSessionId}, got ${String(data.agentSessionId)}`,
        );
      }
    });

    await test.step("cli.whoami_registered_via_ancestry", async () => {
      // whoami always sends the process's ancestryKey (see buildWhoamiRequest); with the same
      // ancestry now registered, a follow-up whoami as the human actor attributes to the
      // registered agent session by ancestry lookup (resolveRegisteredByAncestry), not the
      // human's own literal request.
      const { stdout, stderr } = await runCliSmokeCommand({
        ...humanRunInput,
        args: buildCliWhoamiArgs(),
        extraEnv: CLAUDE_CODE_HARNESS_ENV,
        label: "CLI whoami (registered via ancestry)",
      });
      assertCliOutputSafe({
        label: "CLI whoami (registered via ancestry)",
        redactor,
        stderr,
        stdout,
      });
      const body = parseCliSmokeJson(stdout, "CLI whoami (registered via ancestry)");
      const attribution = assertCliWhoamiAttribution(
        body,
        "CLI whoami (registered via ancestry)",
        "registered",
      );
      if (attribution.agentSessionId !== registeredAgentSessionId) {
        throw new Error(
          `CLI whoami (registered via ancestry) expected agentSessionId ${registeredAgentSessionId}, got ${String(attribution.agentSessionId)}`,
        );
      }
    });

    await test.step("cli.whoami_tag_only", async () => {
      // registerAgentSession's ancestry lookup is scoped by (human_session_id, ancestry_key)
      // (findActiveAgentSession), and whoami always sends ancestryKey = process.ppid (same
      // process tree as every other step in this spec). Mint a second bearer with a distinct
      // sessionId so the ancestry-registered lookup from cli.agent_register misses here, leaving
      // --agent <tag> (tagOnlyAttributionResult) as the only attribution signal.
      const secondSessionId = `session_preview_smoke_cli_agent_tagonly_${randomUUID()}`;
      const secondBearer = await mintBearer({
        rawUserId: preview.ownerUserId,
        sessionId: secondSessionId,
        signingSecret: preview.signingSecret,
        workosUserId: preview.ownerWorkosUserId,
      });
      const tagOnlyRedactor = redactorForPreview(preview, [secondBearer]);
      const tag = `smoke-tag-${randomUUID()}`;
      const { stdout, stderr } = await runCliSmokeCommand({
        apiBaseUrl: preview.apiBaseUrl,
        bearer: secondBearer,
        configDir: workspace.configDir,
        configHomeDir: workspace.configHomeDir,
        redactor: tagOnlyRedactor,
        args: buildCliWhoamiArgs(tag),
        label: "CLI whoami (tag-only)",
      });
      assertCliOutputSafe({
        label: "CLI whoami (tag-only)",
        redactor: tagOnlyRedactor,
        stderr,
        stdout,
      });
      const body = parseCliSmokeJson(stdout, "CLI whoami (tag-only)");
      const attribution = assertCliWhoamiAttribution(body, "CLI whoami (tag-only)", "tag-only");
      if (attribution.tag !== tag) {
        throw new Error(
          `CLI whoami (tag-only) expected tag ${tag}, got ${String(attribution.tag)}`,
        );
      }
    });

    await test.step("cli.agent_register_without_harness_fails", async () => {
      // No harness marker in the child env and no --agent flag: buildRegisterRequest cannot
      // resolve a harness name and fails client-side validation before any API call.
      const result = await runCliSmokeCommandExpectFailure({
        ...humanRunInput,
        args: buildCliAgentRegisterArgs(),
        label: "CLI agent register (no harness)",
      });
      assertCliOutputSafe({
        label: "CLI agent register (no harness)",
        redactor,
        stderr: result.stderr,
        stdout: result.stdout,
      });
      assertCliErrorEnvelope({
        exitCode: result.exitCode,
        expectedErrorCode: "validation.invalid_command_input",
        expectedExitCode: EXIT_VALIDATION,
        label: "CLI agent register (no harness)",
        stderr: result.stderr,
        stdout: result.stdout,
      });
    });
  } finally {
    await workspace.cleanup();
  }
});
