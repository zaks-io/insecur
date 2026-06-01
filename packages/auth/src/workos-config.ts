export interface WorkOSAuthConfig {
  readonly apiKey: string;
  readonly clientId: string;
  readonly cookiePassword: string;
}

export interface InsecurAuthConfig {
  readonly workos: WorkOSAuthConfig;
  /** HMAC secret for insecur CLI ephemeral session credentials (32+ chars). */
  readonly sessionSigningSecret: string;
}
