export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const CLI_RELEASE_PATHS = [
  "packages/cli/src",
  "packages/cli/build.mjs",
  "packages/cli/package.json",
];

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MAX_MODEL_BULLETS = 8;
const MAX_FALLBACK_BULLETS = 12;
const MAX_ERROR_BODY_LENGTH = 800;

export const RELEASE_NOTES_FOOTER =
  "Standalone CLI binaries built with `bun build --compile`. macOS codesign and notarization run when Apple signing secrets are configured. GitHub build-provenance attestations and SLSA provenance sidecars (`*.intoto.jsonl`) are attached when repository visibility and organization billing support GitHub artifact attestations. A CycloneDX SBOM of the bundled CLI (`insecur-cli.sbom.cdx.json`), blocking grype scan report (`insecur-cli.grype.json`), scanner database metadata (`scan-metadata.json`), and repo security attestation bundle (`repo-security-attestation.tgz`) are attached. Draft release: review and publish manually. Verify downloads against `SHA256SUMS`.";

export function validateAnthropicModel(model) {
  if (!/^claude-sonnet(?:-|$)/u.test(model)) {
    throw new Error(`ANTHROPIC_MODEL must be a Claude Sonnet model, got '${model}'.`);
  }
  return model;
}

export function parseGitLog(output) {
  const commits = [];
  let current = null;
  for (const line of output.split(/\r?\n/u)) {
    if (line.startsWith("commit:")) {
      if (current && current.paths.length > 0) {
        commits.push(current);
      }
      const [sha, subject = ""] = line.slice("commit:".length).split("\u001f");
      current = {
        sha,
        shortSha: sha.slice(0, 8),
        subject: sanitizeLine(subject),
        pullRequest: parsePullRequestNumber(subject),
        paths: [],
      };
      continue;
    }
    if (current && line.trim() && isCliReleasePath(line.trim())) {
      current.paths.push(line.trim());
    }
  }
  if (current && current.paths.length > 0) {
    commits.push(current);
  }
  return commits;
}

export function isCliReleasePath(filePath) {
  return (
    filePath === "packages/cli/build.mjs" ||
    filePath === "packages/cli/package.json" ||
    filePath.startsWith("packages/cli/src/")
  );
}

export async function generateCliReleaseNotes(input, options = {}) {
  if (!input.previousTag) {
    return {
      source: "initial",
      notes: "- Initial standalone CLI release.",
    };
  }
  if (input.commits.length === 0) {
    return {
      source: "empty",
      notes: `_No CLI code changes since ${input.previousTag}._`,
    };
  }

  const apiKey = options.anthropicApiKey?.trim() ?? "";
  if (!apiKey) {
    return {
      source: "deterministic",
      notes: deterministicReleaseNotes(input.commits),
    };
  }

  const model = validateAnthropicModel(options.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL);
  return {
    source: "anthropic",
    notes: await generateAnthropicReleaseNotes(input, {
      apiKey,
      model,
      fetchFn: options.fetchFn ?? globalThis.fetch,
    }),
  };
}

export function deterministicReleaseNotes(commits) {
  const bullets = commits
    .slice(0, MAX_FALLBACK_BULLETS)
    .map((commit) => `- ${sanitizeReleaseBullet(commit.subject)}`);
  if (commits.length > MAX_FALLBACK_BULLETS) {
    bullets.push(
      `- ${String(commits.length - MAX_FALLBACK_BULLETS)} additional CLI code commit(s) omitted from deterministic fallback notes.`,
    );
  }
  return bullets.join("\n");
}

export async function generateAnthropicReleaseNotes(input, options) {
  if (typeof options.fetchFn !== "function") {
    throw new Error("fetch is not available for Anthropic release-note generation");
  }
  const response = await options.fetchFn(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "x-api-key": options.apiKey,
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 900,
      system: [
        "You write concise GitHub release-note bullets for the insecur CLI.",
        "Use only the provided JSON metadata.",
        "Include only user-facing CLI behavior, command, output, config, auth, session, local child-process, HTTP-client, install, or release-binary changes.",
        "Drop backend-only, API-only, domain-only, security-gate-only, test-only, CI-only, dependency-only, and refactor-only items unless the metadata clearly shows a CLI user-facing effect.",
        `Return markdown bullets only. Return at most ${String(MAX_MODEL_BULLETS)} bullets. If no user-facing CLI change remains, return exactly '- No user-facing CLI changes.'.`,
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: JSON.stringify(modelInputPayload(input), null, 2),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Anthropic release-note generation failed with HTTP ${String(response.status)}: ${truncateForError(body)}`,
    );
  }

  const body = await response.json();
  if (body.stop_reason !== "end_turn") {
    throw new Error(
      `Anthropic release-note generation stopped with '${String(body.stop_reason)}'.`,
    );
  }

  const notes = extractAnthropicText(body);
  validateModelNotes(notes);
  return notes;
}

export function modelInputPayload(input) {
  return {
    schema_version: 1,
    release: {
      tag: input.tag,
      previous_tag: input.previousTag,
      release_sha: input.releaseSha,
    },
    scope: {
      include_only_paths: CLI_RELEASE_PATHS,
      excluded:
        "diffs, source contents, tests, backend packages, docs outside the bundled CLI source tree, workflow logs, environment variables, and secrets",
    },
    commits: input.commits.map((commit) => ({
      sha: commit.shortSha,
      subject: commit.subject,
      pull_request: commit.pullRequest,
      paths: commit.paths,
    })),
  };
}

export function extractAnthropicText(body) {
  const content = Array.isArray(body?.content) ? body.content : [];
  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new Error("Anthropic release-note generation returned no text content.");
  }
  return text;
}

export function validateModelNotes(notes) {
  const lines = notes
    .trim()
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("Anthropic release-note generation returned empty notes.");
  }
  if (lines.length > MAX_MODEL_BULLETS) {
    throw new Error(
      `Anthropic release-note generation returned ${String(lines.length)} bullets; max is ${String(MAX_MODEL_BULLETS)}.`,
    );
  }
  const nonBullets = lines.filter((line) => !line.startsWith("- "));
  if (nonBullets.length > 0) {
    throw new Error(
      `Anthropic release-note generation returned non-bullet output: ${nonBullets[0]}`,
    );
  }
  if (/^#{1,6}\s/mu.test(notes)) {
    throw new Error("Anthropic release-note generation returned a heading; expected bullets only.");
  }
}

export function buildReleaseNotesMarkdown(notes) {
  return `## What's changed\n\n${notes.trim()}\n\n${RELEASE_NOTES_FOOTER}\n`;
}

function parsePullRequestNumber(subject) {
  const match = subject.match(/\(#(?<number>\d+)\)\s*$/u);
  return match?.groups?.number ? Number.parseInt(match.groups.number, 10) : null;
}

function sanitizeLine(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function sanitizeReleaseBullet(value) {
  return sanitizeLine(value).replace(/^[-*]\s+/u, "");
}

function truncateForError(value) {
  const text = sanitizeLine(value);
  return text.length > MAX_ERROR_BODY_LENGTH ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}...` : text;
}
