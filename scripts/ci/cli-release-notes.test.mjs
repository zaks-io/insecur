import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReleaseNotesMarkdown,
  generateAnthropicReleaseNotes,
  generateCliReleaseNotes,
  isCliReleasePath,
  modelInputPayload,
  parseGitLog,
  validateAnthropicModel,
  validateModelNotes,
} from "./cli-release-notes-lib.mjs";

const releaseInput = {
  tag: "cli-v0.2.0",
  releaseSha: "abc123456789",
  previousTag: "cli-v0.1.0",
  commits: [
    {
      sha: "1111111111111111111111111111111111111111",
      shortSha: "11111111",
      subject: "feat(cli): add run status output (#123)",
      pullRequest: 123,
      paths: ["packages/cli/src/commands/run.ts"],
    },
  ],
};

test("CLI release path filter keeps shipped CLI source and build metadata only", () => {
  assert.equal(isCliReleasePath("packages/cli/src/commands/run.ts"), true);
  assert.equal(isCliReleasePath("packages/cli/package.json"), true);
  assert.equal(isCliReleasePath("packages/cli/build.mjs"), true);
  assert.equal(isCliReleasePath("packages/cli/test/run.test.ts"), false);
  assert.equal(isCliReleasePath("packages/auth/src/cli-exchange.ts"), false);
  assert.equal(isCliReleasePath(".github/workflows/cli-release.yml"), false);
});

test("git log parser drops commits without CLI release paths", () => {
  const commits = parseGitLog(
    [
      "commit:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\u001ffeat(cli): keep this (#1)",
      "packages/cli/src/index.ts",
      "",
      "commit:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\u001ffeat(api): drop this (#2)",
      "packages/auth/src/cli-exchange.ts",
      "",
    ].join("\n"),
  );

  assert.equal(commits.length, 1);
  assert.equal(commits[0].shortSha, "aaaaaaaa");
  assert.equal(commits[0].pullRequest, 1);
  assert.deepEqual(commits[0].paths, ["packages/cli/src/index.ts"]);
});

test("model input sends only metadata, not diffs or source contents", () => {
  const payload = modelInputPayload(releaseInput);

  assert.deepEqual(payload.commits, [
    {
      sha: "11111111",
      subject: "feat(cli): add run status output (#123)",
      pull_request: 123,
      paths: ["packages/cli/src/commands/run.ts"],
    },
  ]);
  assert.match(payload.scope.excluded, /diffs/u);
  assert.match(payload.scope.excluded, /source contents/u);
  assert.doesNotMatch(JSON.stringify(payload), /ANTHROPIC_API_KEY|SECRET|TOKEN=/u);
});

test("Anthropic model validation allows Sonnet and rejects Haiku", () => {
  assert.equal(validateAnthropicModel("claude-sonnet-5"), "claude-sonnet-5");
  assert.equal(validateAnthropicModel("claude-sonnet-4-6"), "claude-sonnet-4-6");
  assert.throws(() => validateAnthropicModel("claude-haiku-4-5-20251001"), /Sonnet/u);
});

test("missing Anthropic key skips model call and uses deterministic notes", async () => {
  const result = await generateCliReleaseNotes(releaseInput, {
    anthropicApiKey: "",
    fetchFn: async () => {
      throw new Error("fetch should not be called without an API key");
    },
  });

  assert.equal(result.source, "deterministic");
  assert.match(result.notes, /feat\(cli\): add run status output/u);
});

test("configured Anthropic key fails closed on HTTP errors", async () => {
  await assert.rejects(
    () =>
      generateCliReleaseNotes(releaseInput, {
        anthropicApiKey: "test-key",
        anthropicModel: "claude-sonnet-5",
        fetchFn: async () =>
          new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 }),
      }),
    /HTTP 400/u,
  );
});

test("configured Anthropic key fails fast on timed out model requests", async () => {
  await assert.rejects(
    () =>
      generateAnthropicReleaseNotes(releaseInput, {
        apiKey: "test-key",
        model: "claude-sonnet-5",
        timeoutMs: 1,
        fetchFn: async (_url, options) => {
          assert.equal(options.signal instanceof AbortSignal, true);
          if (options.signal.aborted) {
            throw options.signal.reason;
          }
          await new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), {
              once: true,
            });
          });
        },
      }),
    /timed out after 1ms/u,
  );
});

test("configured Anthropic key fails closed on malformed model output", async () => {
  await assert.rejects(
    () =>
      generateCliReleaseNotes(releaseInput, {
        anthropicApiKey: "test-key",
        anthropicModel: "claude-sonnet-5",
        fetchFn: async () =>
          Response.json({
            stop_reason: "end_turn",
            content: [{ type: "text", text: "## Heading\n\nNot a bullet" }],
          }),
      }),
    /non-bullet output|heading/u,
  );
});

test("configured Anthropic key returns validated model bullets", async () => {
  const result = await generateCliReleaseNotes(releaseInput, {
    anthropicApiKey: "test-key",
    anthropicModel: "claude-sonnet-5",
    fetchFn: async (_url, options) => {
      assert.equal(options.signal instanceof AbortSignal, true);
      const body = JSON.parse(options.body);
      assert.equal(body.model, "claude-sonnet-5");
      assert.match(body.messages[0].content[0].text, /packages\/cli\/src\/commands\/run\.ts/u);
      return Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "- Added clearer `insecur run` status output." }],
      });
    },
  });

  assert.equal(result.source, "anthropic");
  assert.equal(result.notes, "- Added clearer `insecur run` status output.");
});

test("release notes builder preserves the heading, footer, and source SHA marker", () => {
  const sourceSha = "0123456789abcdef0123456789abcdef01234567";
  const markdown = buildReleaseNotesMarkdown("- Added clearer status output.", sourceSha);

  assert.match(markdown, /^## What's changed/u);
  assert.match(markdown, /Standalone CLI binaries/u);
  assert.match(markdown, new RegExp(`<!-- insecur-cli-release-source-sha: ${sourceSha} -->`, "u"));
  assert.throws(() => buildReleaseNotesMarkdown("- One", "not-a-sha"), /full 40-character/u);
});

test("model notes validator accepts bullets only", () => {
  assert.doesNotThrow(() => validateModelNotes("- One\n- Two"));
  assert.throws(() => validateModelNotes("One\n- Two"), /non-bullet/u);
  assert.throws(() => validateModelNotes("# Heading\n- One"), /non-bullet|heading/u);
});
