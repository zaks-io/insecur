import type { LocalStore } from "@insecur/local-store";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { ApiClient } from "./types.js";
import { createUnsupportedLocalApiMethods } from "./local-client-stubs.js";
import { createLocalRuntimeInjectionApi, createLocalSecretsApi } from "./local-client-runtime.js";
import type { GlobalCliFlags } from "../cli-options.js";

export interface CreateLocalApiClientInput {
  readonly store: LocalStore;
  readonly context: ResolvedCliContext;
  readonly flags: GlobalCliFlags;
}

export function createLocalApiClient(input: CreateLocalApiClientInput): ApiClient {
  return {
    createCliAuthorizationUrl: () => {
      throw new Error("createCliAuthorizationUrl is not available in Local Mode");
    },
    ...createUnsupportedLocalApiMethods(),
    ...createLocalSecretsApi(input),
    ...createLocalRuntimeInjectionApi(input),
  };
}
