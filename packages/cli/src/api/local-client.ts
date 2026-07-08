import type { LocalStore } from "@insecur/local-store";
import type { ResolvedCliContext } from "../config/load-cli-context.js";
import type { ApiClient } from "./types.js";
import { createUnsupportedLocalApiMethods } from "./local-client-stubs.js";
import { createLocalNavigationApi } from "./local-client-navigation.js";
import { createLocalSecretsReadApi } from "./local-client-secrets-read.js";
import {
  createLocalRuntimeInjectionApi,
  createLocalSecretsWriteApi,
} from "./local-client-runtime.js";
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
    ...createLocalNavigationApi(input),
    ...createLocalSecretsWriteApi(input),
    ...createLocalSecretsReadApi(input),
    ...createLocalRuntimeInjectionApi(input),
  };
}
