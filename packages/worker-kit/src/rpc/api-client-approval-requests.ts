import type { ApiFetch } from "./api-client.js";

function approvalRequestPath(
  organizationId: string,
  approvalRequestId: string,
  action?: "approve" | "reject" | "cancel",
): string {
  const base = `/v1/orgs/${encodeURIComponent(organizationId)}/approval-requests/${encodeURIComponent(approvalRequestId)}`;
  return action === undefined ? base : `${base}/${action}`;
}

export function createApprovalRequestApiMethods(apiFetch: ApiFetch) {
  return {
    orgApprovalRequests: async (organizationId: string): Promise<unknown> => {
      const response = await apiFetch(
        `/v1/orgs/${encodeURIComponent(organizationId)}/approval-requests`,
      );
      return response.json();
    },
    orgApprovalRequest: async (
      organizationId: string,
      approvalRequestId: string,
    ): Promise<unknown> => {
      const response = await apiFetch(approvalRequestPath(organizationId, approvalRequestId));
      return response.json();
    },
    approveOrgApprovalRequest: async (
      organizationId: string,
      approvalRequestId: string,
      body: Record<string, unknown>,
    ): Promise<unknown> => {
      const response = await apiFetch(
        approvalRequestPath(organizationId, approvalRequestId, "approve"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      return response.json();
    },
    rejectOrgApprovalRequest: async (organizationId: string, approvalRequestId: string) =>
      apiFetch(approvalRequestPath(organizationId, approvalRequestId, "reject"), {
        method: "POST",
      }).then((response) => response.json()),
    cancelOrgApprovalRequest: async (organizationId: string, approvalRequestId: string) =>
      apiFetch(approvalRequestPath(organizationId, approvalRequestId, "cancel"), {
        method: "POST",
      }).then((response) => response.json()),
  };
}
