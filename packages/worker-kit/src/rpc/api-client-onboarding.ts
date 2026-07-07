export async function fetchProvisionPersonalOrganization(
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await apiFetch("/v1/onboarding/personal-organization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}
