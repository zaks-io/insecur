import type { DisplayName, UserId } from "@insecur/domain";

export const USER_ADMISSION_STATUSES = ["active", "revoked"] as const;

export type UserAdmissionStatus = (typeof USER_ADMISSION_STATUSES)[number];

export interface ActiveUserAdmissionRow {
  readonly userId: UserId;
  readonly workosUserId: string;
  readonly displayName: DisplayName | null;
}

export interface SeedUserAdmissionInput {
  readonly admissionId: string;
  readonly instanceId: string;
  readonly userId: UserId;
  readonly workosUserId: string;
  readonly displayName?: DisplayName;
}
