import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import { describe, expect, it } from "vitest";
import { buildProgramForIntrospection } from "../src/program.js";

// Lockstep gate for the hand-written public docs (apps/site/src/docs/content): every `insecur ...`
// invocation in a sh code block must name a real command path, and every long flag it passes must
// exist on that command or as a global option. The generated reference pages cannot drift by
// construction; this closes the same gap for prose examples, so renaming a command or flag fails
// here with a pointer to the offending page instead of shipping broken docs.

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const contentDir = join(repoRoot, "apps", "site", "src", "docs", "content");

function walkMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function extractInsecurInvocations(markdown: string): string[] {
  const invocations: string[] = [];
  for (const [, block] of markdown.matchAll(/```sh\n([\s\S]*?)```/g)) {
    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("insecur ")) {
        invocations.push(trimmed);
      }
    }
  }
  return invocations;
}

function longFlagsOf(command: Command): string[] {
  return command.options.flatMap((option) => option.flags.match(/--[a-z0-9-]+/g) ?? []);
}

function resolveCommandChain(
  program: Command,
  tokens: readonly string[],
): { command: Command; knownFlags: Set<string> } {
  let command: Command = program;
  const knownFlags = new Set<string>(longFlagsOf(program));
  for (const token of tokens) {
    const next = command.commands.find(
      (candidate) => candidate.name() === token || candidate.aliases().includes(token),
    );
    if (!next) {
      break;
    }
    command = next;
    for (const flag of longFlagsOf(command)) {
      knownFlags.add(flag);
    }
  }
  // Bare `insecur --version` style invocations resolve to the root program; a named first token
  // that matches no command is a docs defect.
  if (command === program && tokens.length > 0) {
    throw new Error(`unknown insecur command: ${tokens[0]}`);
  }
  return { command, knownFlags };
}

describe("docs command examples", () => {
  const program = buildProgramForIntrospection();
  const files = walkMarkdownFiles(contentDir);

  it("finds docs content to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const file of files) {
    const relPath = file.slice(repoRoot.length);
    it(`validates every insecur invocation in ${relPath}`, () => {
      for (const invocation of extractInsecurInvocations(readFileSync(file, "utf8"))) {
        // Everything after `--` belongs to the child command; shell operators end the insecur
        // argument list.
        const stopTokens = new Set(["--", "|", "||", "&&", "<", ">", ";"]);
        const tokens: string[] = [];
        for (const token of invocation.split(/\s+/).slice(1)) {
          if (stopTokens.has(token)) {
            break;
          }
          tokens.push(token);
        }

        const subcommandTokens = tokens.filter((token) => !token.startsWith("-"));
        const resolved = resolveCommandChain(program, subcommandTokens);

        for (const token of tokens) {
          if (!token.startsWith("--")) {
            continue;
          }
          const flag = token.split("=")[0];
          expect(
            resolved.knownFlags.has(flag),
            `${invocation}\n  unknown flag ${flag} for \`insecur ${subcommandTokens[0] ?? ""}\``,
          ).toBe(true);
        }
      }
    });
  }
});
