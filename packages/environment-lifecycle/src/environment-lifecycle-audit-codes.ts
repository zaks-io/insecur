import { PRODUCTION_AUDIT_EVENT_CODES } from "@insecur/audit";

export const ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES = {
  lifecycleRead: PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleRead,
  lifecycleReadDenied: PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleReadDenied,
  lifecycleUpdated: PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleUpdated,
  lifecycleUpdateDenied: PRODUCTION_AUDIT_EVENT_CODES.environmentLifecycleUpdateDenied,
} as const;

export type EnvironmentLifecycleAuditEventCode =
  (typeof ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES)[keyof typeof ENVIRONMENT_LIFECYCLE_AUDIT_EVENT_CODES];
