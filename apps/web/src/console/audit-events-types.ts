/** Metadata-only actor reference for console audit rows. */
export interface ConsoleAuditActor {
  readonly actorType: "user" | "machine" | "ci_exchange";
  readonly userId?: string;
  readonly machineIdentityId?: string;
}

/** Metadata-only resource reference on an audit row. */
export interface ConsoleAuditResource {
  readonly type: string;
  readonly id: string;
}

/** Metadata-only audit event row for the console recent-activity feed. */
export interface ConsoleAuditEvent {
  readonly auditEventId: string;
  readonly eventCode: string;
  readonly outcome: "success" | "denied";
  readonly actor: ConsoleAuditActor;
  readonly projectId: string | null;
  readonly environmentId: string | null;
  readonly resource: ConsoleAuditResource | null;
  readonly details: Readonly<Record<string, string | number | boolean | null>> | null;
  readonly createdAt: string;
}

export interface ConsoleRecentActivity {
  readonly events: readonly ConsoleAuditEvent[];
  readonly nextCursor: string | null;
}

/** Page size for the Home feed: a short recent window, not the full audit log. */
export const HOME_RECENT_ACTIVITY_PAGE_SIZE = 10;
