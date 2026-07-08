export function challengeClearStepUpHref(input: {
  readonly returnTo: string;
  readonly organizationId: string;
  readonly operationId: string;
  readonly projectId: string;
  readonly environmentId?: string;
}): string {
  const params = new URLSearchParams({
    returnTo: input.returnTo,
    organizationId: input.organizationId,
    operationId: input.operationId,
    projectId: input.projectId,
  });
  if (input.environmentId !== undefined) {
    params.set("environmentId", input.environmentId);
  }
  return `/auth/step-up?${params.toString()}`;
}
