import type {
  LocalConsumedInjectionGrantRow,
  LocalInjectionGrantConsumeInput,
  LocalInjectionGrantConsumeFailure,
  LocalInsertInjectionGrantInput,
} from "./types.js";

/** Local one-use Injection Grant persistence (metadata only). */
export interface LocalInjectionGrantStore {
  insertGrant(input: LocalInsertInjectionGrantInput): Promise<void>;
  tryConsumeGrant(
    input: LocalInjectionGrantConsumeInput,
  ): Promise<
    | { ok: true; grant: LocalConsumedInjectionGrantRow }
    | { ok: false; failure: LocalInjectionGrantConsumeFailure }
  >;
}
