import type { EnvironmentId, ProjectId } from "@insecur/domain";
import type { LocalStore } from "@insecur/local-store";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { SecretsApiClient } from "./secrets-api-types.js";
import type { RuntimeInjectionApiClient } from "./runtime-injection-api-types.js";
import type { GlobalCliFlags } from "../cli-options.js";
import { writeLocalSecretByVariableKey } from "../local/local-secrets-write.js";
import {
  consumeLocalVariableKeyInjectionGrant,
  issueLocalVariableKeyInjectionGrant,
  recordLocalInjectionRunCompleted,
} from "../local/local-injection-grants.js";
import { unsupportedLocalApi } from "./local-client-stubs.js";

function requireLocalProjectId(context: ResolvedCliContext): ProjectId {
  const projectId = context.scope.projectId;
  if (projectId === undefined) {
    throw new Error("local project scope is missing projectId");
  }
  return projectId;
}

function requireLocalEnvironmentId(context: ResolvedCliContext): EnvironmentId {
  const environmentId = context.scope.envId;
  if (environmentId === undefined) {
    throw new Error("local project scope is missing envId");
  }
  return environmentId;
}

export function createLocalSecretsApi(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
  readonly flags: GlobalCliFlags;
}): Pick<SecretsApiClient, "writeSecretByVariableKey"> {
  return {
    writeSecretByVariableKey: async (request) => {
      const base = {
        projectId: request.projectId,
        environmentId: request.environmentId,
        variableKey: request.variableKey,
        ...(request.allowEmpty === true ? { allowEmpty: true as const } : {}),
      };
      const write =
        "generate" in request
          ? { ...base, generate: request.generate }
          : { ...base, valueUtf8: request.valueUtf8 };
      return writeLocalSecretByVariableKey({
        store: input.store,
        flags: input.flags,
        projectConfig: input.context.projectConfig,
        write,
      });
    },
  };
}

export function createLocalRuntimeInjectionApi(input: {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
}): Pick<
  RuntimeInjectionApiClient,
  "issueInjectionGrant" | "consumeInjectionGrant" | "recordInjectionRunCompleted"
> {
  const projectId = requireLocalProjectId(input.context);
  const environmentId = requireLocalEnvironmentId(input.context);
  return {
    issueInjectionGrant: async (request) => {
      if ("policyId" in request) {
        return unsupportedLocalApi("issueInjectionGrant(policy)")();
      }
      return issueLocalVariableKeyInjectionGrant({
        store: input.store,
        projectId: request.projectId,
        environmentId: request.environmentId,
        variableKey: request.variableKey,
      });
    },
    consumeInjectionGrant: async (request) =>
      consumeLocalVariableKeyInjectionGrant({
        store: input.store,
        projectId,
        environmentId,
        grantId: request.grantId,
        variableKey: request.variableKey,
      }),
    recordInjectionRunCompleted: async (request) =>
      recordLocalInjectionRunCompleted({
        store: input.store,
        projectId,
        environmentId,
        grantId: request.grantId,
        childExitCode: request.childExitCode,
      }),
  };
}
