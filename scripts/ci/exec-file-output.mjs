import { execFile } from "node:child_process";
import { promisify } from "node:util";

const defaultExecFileAsync = promisify(execFile);

export async function execFileForOutput(command, args, options = {}) {
  const {
    execFileAsync = defaultExecFileAsync,
    failureMessage = `${command} exited with a non-zero status`,
    ...execOptions
  } = options;

  try {
    return await execFileAsync(command, args, execOptions);
  } catch (error) {
    throw new Error(formatExecFailure(error, failureMessage), { cause: error });
  }
}

function formatExecFailure(error, fallback) {
  const streams = ["stdout", "stderr"]
    .map((key) => (isRecord(error) && typeof error[key] === "string" ? error[key].trim() : ""))
    .filter(Boolean);
  return streams.join("\n") || fallback;
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}
