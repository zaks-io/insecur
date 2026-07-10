import type { Command } from "commander";
import { describe, expect, it } from "vitest";

import {
  buildCliAgentEnvArgs,
  buildCliAgentRegisterArgs,
  buildCliAuditExportArgs,
  buildCliAuditTailArgs,
  buildCliAuditVerifyArgs,
  buildCliFirstValueRunArgs,
  buildCliOperationsGetArgs,
  buildCliOperationsWaitArgs,
  buildCliRunPoliciesCreateArgs,
  buildCliRunPoliciesDisableArgs,
  buildCliRunPoliciesShowArgs,
  buildCliSecretsSetGenerateArgs,
  buildCliSecretsSetValueStdinArgs,
  buildCliSecretsVersionsArgs,
  buildCliWhoamiArgs,
} from "../../preview-smoke/src/cli-smoke-commands.js";
import { buildProgramForIntrospection } from "../src/program.js";

/**
 * Drift gate for INS-594: every argv the preview-smoke harness sends to this CLI must
 * resolve against the REAL registered command tree (`buildProgramForIntrospection`, the
 * same tree the docs generator walks). A CLI surface change that breaks a smoke
 * invocation fails here, in this package's unit tests, instead of failing the live
 * Preview Smoke -> Deploy Production chain. The smoke builders live in
 * `@insecur/preview-smoke` as a leaf module with no imports, so this test pulls in
 * nothing beyond the argv shapes themselves.
 */

interface ResolvedCommand {
  readonly command: Command;
  readonly rest: readonly string[];
}

function subcommand(parent: Command, name: string): Command | undefined {
  return parent.commands.find(
    (candidate) => candidate.name() === name || candidate.aliases().includes(name),
  );
}

function resolveCommand(program: Command, args: readonly string[]): ResolvedCommand {
  let current = program;
  let index = 0;
  while (index < args.length) {
    const next = subcommand(current, args[index] ?? "");
    if (next === undefined) {
      break;
    }
    current = next;
    index += 1;
  }
  if (current === program) {
    throw new Error(`argv resolves no command: ${args.join(" ")}`);
  }
  return { command: current, rest: args.slice(index) };
}

function allowsUnknownTokens(command: Command): boolean {
  return Reflect.get(command, "_allowUnknownOption") === true;
}

function allowsExcessArguments(command: Command): boolean {
  return Reflect.get(command, "_allowExcessArguments") === true;
}

/**
 * Splits the tokens after the resolved command into positional operands, validating
 * every `--flag` against the command's registered options and consuming option
 * values the way commander does.
 */
function collectOperands(resolved: ResolvedCommand): string[] {
  const operands: string[] = [];
  const tokens = [...resolved.rest];
  while (tokens.length > 0) {
    const token = tokens.shift();
    if (token === undefined || token === "--") {
      // Everything after the separator is the child command; commander does not
      // parse it against this command's grammar.
      return operands;
    }
    if (!token.startsWith("-")) {
      operands.push(token);
      continue;
    }
    const option = resolved.command.options.find(
      (candidate) => candidate.long === token || candidate.short === token,
    );
    if (option === undefined) {
      if (allowsUnknownTokens(resolved.command)) {
        continue;
      }
      throw new Error(`unknown option ${token} for \`${resolved.command.name()}\``);
    }
    if (option.required && (tokens.length === 0 || tokens[0] === "--")) {
      throw new Error(`option ${token} is missing its required value`);
    }
    const consumesValue = option.required || option.optional;
    if (consumesValue && tokens[0] !== undefined && !tokens[0].startsWith("-")) {
      tokens.shift();
    }
  }
  return operands;
}

function assertParses(program: Command, args: readonly string[]): void {
  const resolved = resolveCommand(program, args);
  const operands = collectOperands(resolved);
  const registered = resolved.command.registeredArguments;
  const required = registered.filter((argument) => argument.required).length;
  const variadic = registered.some((argument) => argument.variadic);
  if (operands.length < required) {
    throw new Error(`\`${args.join(" ")}\` is missing required arguments`);
  }
  if (
    !variadic &&
    !allowsExcessArguments(resolved.command) &&
    operands.length > registered.length
  ) {
    throw new Error(`\`${args.join(" ")}\` has excess arguments`);
  }
}

const SMOKE_ARGVS: readonly (readonly [string, readonly string[]])[] = [
  ["init", ["init"]],
  ["whoami", buildCliWhoamiArgs()],
  ["orgs list", ["orgs", "list"]],
  ["projects list", ["projects", "list"]],
  ["envs list", ["envs", "list"]],
  ["config show", ["config", "show"]],
  ["logout", ["logout"]],
  ["secrets list", ["secrets", "list"]],
  ["secrets set --value-stdin", buildCliSecretsSetValueStdinArgs()],
  [
    "secrets set --value-stdin --allow-empty",
    buildCliSecretsSetValueStdinArgs("EMPTY_KEY", { allowEmpty: true }),
  ],
  ["secrets set --generate", buildCliSecretsSetGenerateArgs({ variableKey: "GENERATED_KEY" })],
  ["secrets versions", buildCliSecretsVersionsArgs("sec_0000000000000000")],
  ["run (first value)", buildCliFirstValueRunArgs("/tmp/verify.mjs")],
  ["audit tail", buildCliAuditTailArgs()],
  ["audit export", buildCliAuditExportArgs("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z")],
  [
    "audit verify",
    buildCliAuditVerifyArgs("/tmp/export.jsonl", "/tmp/manifest.json", "https://example.test/keys"),
  ],
  ["operations get", buildCliOperationsGetArgs("op_0000000000000000")],
  ["operations wait", buildCliOperationsWaitArgs("op_0000000000000000", 30)],
  [
    "run-policies create",
    buildCliRunPoliciesCreateArgs({
      policyId: "rp_0000000000000000",
      envId: "env_0000000000000000",
      command: "node app.js",
      secretIds: ["sec_0000000000000000"],
    }),
  ],
  ["run-policies show", buildCliRunPoliciesShowArgs("rp_0000000000000000")],
  [
    "run-policies disable",
    buildCliRunPoliciesDisableArgs({
      policyId: "rp_0000000000000000",
      envId: "env_0000000000000000",
      comment: "smoke",
    }),
  ],
  ["agent env", buildCliAgentEnvArgs()],
  ["agent register", buildCliAgentRegisterArgs()],
];

describe("preview-smoke CLI argv builders match the registered CLI surface", () => {
  const program = buildProgramForIntrospection();

  it.each(SMOKE_ARGVS.map(([name, args]) => ({ args, name })))(
    "$name parses against the real command tree",
    ({ args }) => {
      assertParses(program, args);
    },
  );

  it("the validator itself rejects the pre-INS-594 drifted secrets set shape", () => {
    expect(() => {
      assertParses(program, ["secrets", "set", "--variable-key", "KEY", "--value-stdin"]);
    }).toThrow(/unknown option --variable-key/);
  });

  it("the validator itself rejects missing required positionals", () => {
    expect(() => {
      assertParses(program, ["secrets", "versions"]);
    }).toThrow(/missing required arguments/);
  });
});
