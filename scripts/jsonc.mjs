export function parseJsonc(text, sourcePath = "JSONC input") {
  const withoutComments = text
    .split("\n")
    .map((line) => stripJsoncLineComment(line))
    .join("\n");
  try {
    return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, "$1"));
  } catch (error) {
    throw new Error(`Failed to parse ${sourcePath}: ${error.message}`);
  }
}

function stripJsoncLineComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i - 1] !== "\\") {
      inString = !inString;
    }
    if (!inString && char === "/" && line[i + 1] === "/") {
      return line.slice(0, i);
    }
  }
  return line;
}
