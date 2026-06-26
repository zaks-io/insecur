/** Process-memory session store; never persisted to disk by the CLI. */
export interface MemorySession {
  readonly credential: string;
  readonly sessionId: string;
  readonly expiresAt: string;
}

let activeSession: MemorySession | undefined;

export function getMemorySession(): MemorySession | undefined {
  return activeSession;
}

export function setMemorySession(session: MemorySession): void {
  activeSession = session;
}

export function clearMemorySession(): void {
  activeSession = undefined;
}
