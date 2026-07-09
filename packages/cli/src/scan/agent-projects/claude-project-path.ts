import { stat } from "node:fs/promises";
import { join, sep } from "node:path";

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function encodedPathTokens(encodedProject: string): readonly string[] {
  return encodedProject
    .replace(/^-/, "")
    .split("-")
    .filter((token) => token.length > 0);
}

async function longestExistingSegment(
  currentPath: string,
  tokens: readonly string[],
  startIndex: number,
): Promise<{ readonly nextPath: string; readonly nextIndex: number } | null> {
  for (let endIndex = tokens.length; endIndex > startIndex; endIndex -= 1) {
    const segment = tokens.slice(startIndex, endIndex).join("-");
    const candidate = join(currentPath, segment);
    if (await directoryExists(candidate)) {
      return { nextPath: candidate, nextIndex: endIndex };
    }
  }
  return null;
}

export async function resolveClaudeEncodedProjectPath(
  encodedProject: string,
): Promise<string | null> {
  const tokens = encodedPathTokens(encodedProject);
  let currentPath: string = sep;
  let tokenIndex = 0;

  while (tokenIndex < tokens.length) {
    const segment = await longestExistingSegment(currentPath, tokens, tokenIndex);
    if (segment === null) {
      return null;
    }
    currentPath = segment.nextPath;
    tokenIndex = segment.nextIndex;
  }

  return currentPath;
}
