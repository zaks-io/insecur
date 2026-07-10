const PRIVACY_POLICY_URL = "https://insecur.cloud/privacy";

export function LoginPrivacyNotice() {
  return (
    <p className="text-xs text-muted-foreground">
      We use Cloudflare Turnstile to protect sign-in from automated abuse. Read our{" "}
      <a
        href={PRIVACY_POLICY_URL}
        className="font-medium text-foreground underline underline-offset-4"
      >
        privacy policy
      </a>
      .
    </p>
  );
}
