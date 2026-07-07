import type { InjectionGrantId, ProjectId, SecretId, VariableKey } from "@insecur/domain";

import type {
  LocalConsumedInjectionGrantRow,
  LocalInjectionGrantConsumeFailure,
  LocalInsertInjectionGrantInput,
} from "./types.js";

/** Local one-use Injection Grant persistence (metadata only). */
export interface LocalInjectionGrantStore {
  insertGrant(input: LocalInsertInjectionGrantInput): Promise<void>;
  tryConsumeGrant(
    projectId: ProjectId,
    grantId: InjectionGrantId,
    secretId: SecretId,
    variableKey: VariableKey,
  ): Promise<
    | { ok: true; grant: LocalConsumedInjectionGrantRow }
    | { ok: false; failure: LocalInjectionGrantConsumeFailure }
  >;
}
