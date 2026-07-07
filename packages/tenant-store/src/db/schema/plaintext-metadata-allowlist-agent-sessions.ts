import type { PlaintextMetadataAllowlist } from "./plaintext-metadata-allowlist.js";

/** Agent session attribution table (ADR-0070 fragment). */
export const PLAINTEXT_METADATA_ALLOWLIST_AGENT_SESSIONS = {
  agent_sessions: {
    ancestry_key: { category: "type-code" },
    closed_at: { category: "timestamp" },
    created_at: { category: "timestamp" },
    harness_name: { category: "type-code" },
    human_session_id: { category: "opaque-id" },
    id: { category: "opaque-id" },
    tier: { category: "type-code" },
    user_id: { category: "actor-id" },
  },
} as const satisfies PlaintextMetadataAllowlist;
