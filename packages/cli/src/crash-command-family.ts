export function resolveCliCommandFamily(argv: readonly string[]): string {
  const [root, child] = collectCommandTokens(argv);
  return resolveKnownFamily(root, child);
}

function collectCommandTokens(argv: readonly string[]): readonly string[] {
  const tokens: string[] = [];
  const args = argv.slice(2);
  for (let index = 0; index < args.length && tokens.length < 2; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      break;
    }
    if (arg === undefined) {
      continue;
    }
    if (arg.startsWith("-")) {
      index += shouldSkipOptionValue(arg) ? 1 : 0;
      continue;
    }
    tokens.push(arg);
  }
  return tokens;
}

function resolveKnownFamily(root: string | undefined, child: string | undefined): string {
  if (root === undefined) {
    return "root";
  }
  if (!knownRootCommands.has(root)) {
    return "unknown";
  }
  if (child === undefined || !commandsWithChildren.has(root)) {
    return root;
  }
  const family = `${root}.${child}`;
  return knownCommandFamilies.has(family) ? family : root;
}

function shouldSkipOptionValue(option: string): boolean {
  const name = option.split("=")[0] ?? option;
  return !option.includes("=") && optionsWithValues.has(name);
}

const optionsWithValues = new Set([
  "--agent",
  "--config-dir",
  "--env-id",
  "--host",
  "--org-id",
  "--profile",
  "--profile-id",
  "--project-id",
]);

const commandsWithChildren = new Set([
  "agent",
  "approvals",
  "audit",
  "config",
  "connections",
  "envs",
  "operations",
  "orgs",
  "projects",
  "run-policies",
  "secrets",
]);

const knownRootCommands = new Set([
  "agent",
  "approvals",
  "audit",
  "config",
  "connections",
  "envs",
  "guide",
  "import",
  "init",
  "login",
  "logout",
  "operations",
  "orgs",
  "projects",
  "run",
  "run-policies",
  "scan",
  "secrets",
  "shell",
  "whoami",
]);

const knownCommandFamilies = new Set([
  "agent.env",
  "agent.register",
  "agent.shell",
  "approvals.list",
  "audit.export",
  "audit.tail",
  "audit.verify",
  "config.set",
  "config.show",
  "connections.create",
  "connections.disconnect",
  "connections.list",
  "connections.reauth",
  "connections.rotate",
  "connections.status",
  "envs.create",
  "envs.list",
  "operations.cancel",
  "operations.get",
  "operations.wait",
  "orgs.list",
  "projects.create",
  "projects.list",
  "run-policies.create",
  "run-policies.disable",
  "run-policies.show",
  "secrets.list",
  "secrets.promote",
  "secrets.rollback",
  "secrets.set",
  "secrets.versions",
]);
