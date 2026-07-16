import type { Command } from "commander";
import { registerEnvsCommands } from "./register-envs-commands.js";
import {
  registerOrgsCommands,
  registerProjectsCommands,
  type NavigationDeps,
} from "./register-orgs-projects-commands.js";

export function registerNavigationCommands(program: Command, deps: NavigationDeps): void {
  registerOrgsCommands(program, deps);
  registerProjectsCommands(program, deps);
  registerEnvsCommands(program, deps);
}
