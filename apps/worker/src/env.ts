export interface WorkerEnv {
  readonly WORKOS_API_KEY: string;
  readonly WORKOS_CLIENT_ID: string;
  readonly WORKOS_COOKIE_PASSWORD: string;
  readonly SESSION_SIGNING_SECRET: string;
  /** JSON map of WorkOS user id to admitted insecur User id (development only). */
  readonly ADMITTED_USER_MAP_JSON?: string;
  /** JSON array of fake sealed sessions for local/testing (development only). */
  readonly WORKOS_FAKE_SESSIONS_JSON?: string;
}
