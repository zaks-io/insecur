import { useNavigate } from "@tanstack/react-router";
import { type SubmitEvent, useState } from "react";
import {
  auditSearchFromFormInput,
  auditSearchHasActiveFilters,
  buildAuditSearchQuery,
  isoToDatetimeLocalInput,
  type AuditSearchParams,
} from "../../console/audit-search.js";
import { AuditFilterGrid } from "./audit-filter-grid.js";
import type { AuditFilterFieldValues } from "./audit-filter-fields.js";

function initialFilterValues(search: AuditSearchParams): AuditFilterFieldValues {
  return {
    actorUserId: search.actorUserId ?? "",
    actorMachineIdentityId: search.actorMachineIdentityId ?? "",
    projectId: search.projectId ?? "",
    environmentId: search.environmentId ?? "",
    eventCode: search.eventCode ?? "",
    createdAtFrom: isoToDatetimeLocalInput(search.createdAtFrom),
    createdAtTo: isoToDatetimeLocalInput(search.createdAtTo),
  };
}

export function AuditFiltersForm({ search }: { search: AuditSearchParams }) {
  const navigate = useNavigate({ from: "/orgs/$orgId/audit" });
  const [values, setValues] = useState(() => initialFilterValues(search));

  function updateField(field: keyof AuditFilterFieldValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function applyFilters(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void navigate({
      search: buildAuditSearchQuery(auditSearchFromFormInput(values)),
    });
  }

  function clearFilters() {
    void navigate({ search: {} });
  }

  return (
    <form
      className="mt-8 rounded-xl border border-border bg-card p-5 sm:p-6"
      onSubmit={applyFilters}
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <h2 className="text-xl font-semibold tracking-tight leading-tight">Filters</h2>
        {auditSearchHasActiveFilters(search) ? (
          <button
            type="button"
            className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={clearFilters}
          >
            Clear all
          </button>
        ) : null}
      </div>
      <AuditFilterGrid values={values} onChange={updateField} />
      <div className="mt-5">
        <button
          type="submit"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
