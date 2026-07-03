import { HIGH_ASSURANCE_ERROR_CODES, type HighAssuranceErrorCode } from "@insecur/domain";

export class HighAssuranceChallengeError extends Error {
  readonly code: HighAssuranceErrorCode;

  constructor(code: HighAssuranceErrorCode, message: string) {
    super(message);
    this.name = "HighAssuranceChallengeError";
    this.code = code;
  }
}

export { HIGH_ASSURANCE_ERROR_CODES };
