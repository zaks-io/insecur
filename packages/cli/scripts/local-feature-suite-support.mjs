import { spawn } from "node:child_process";

export function redact(text) {
  return text.replace(/[A-Za-z0-9_-]{32,}/g, "[redacted-token]");
}

export function parseJsonLines(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function commandOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

export function lastJson(textOrResult, label) {
  const parsed = parseJsonLines(
    typeof textOrResult === "string" ? textOrResult : commandOutput(textOrResult),
  );
  const value = parsed.at(-1);
  if (value === undefined) {
    throw new Error(`${label} produced no JSON output`);
  }
  return value;
}

export function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function expectJsonStdoutOnly(result, label) {
  expect(result.stdout.trim().startsWith("{"), `${label} did not write JSON to stdout`);
  expect(result.stderr === "", `${label} wrote unexpected stderr: ${redact(result.stderr)}`);
}

export function expectJsonStderrOnly(result, label) {
  expect(result.stdout === "", `${label} wrote unexpected stdout: ${redact(result.stdout)}`);
  expect(result.stderr.trim().startsWith("{"), `${label} did not write JSON to stderr`);
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(options.stdin ?? "");
  });
}

export function createCli({ cliPath, env, projectDir, repoRoot }) {
  const commonArgs = [cliPath, "--config-dir", projectDir, "--json"];
  return (args, options = {}) =>
    run("node", [...commonArgs, ...args], { cwd: repoRoot, env, ...options });
}
