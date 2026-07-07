import {
  AuditDateFilterField,
  AuditTextFilterField,
  type AuditFilterFieldValues,
} from "./audit-filter-fields.js";

const TEXT_FILTERS = [
  { key: "actorUserId", label: "Actor user ID", placeholder: "usr_…" },
  { key: "actorMachineIdentityId", label: "Actor machine identity", placeholder: "mid_…" },
  { key: "projectId", label: "Project ID", placeholder: "prj_…" },
  { key: "environmentId", label: "Environment ID", placeholder: "env_…" },
  { key: "eventCode", label: "Event code", placeholder: "secret.non_protected_write" },
] as const satisfies readonly {
  key: keyof AuditFilterFieldValues;
  label: string;
  placeholder: string;
}[];

const DATE_FILTERS = [
  { key: "createdAtFrom", label: "From (UTC)" },
  { key: "createdAtTo", label: "To (UTC)" },
] as const satisfies readonly {
  key: keyof AuditFilterFieldValues;
  label: string;
}[];

export function AuditFilterGrid({
  values,
  onChange,
}: {
  values: AuditFilterFieldValues;
  onChange: (field: keyof AuditFilterFieldValues, value: string) => void;
}) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TEXT_FILTERS.map((field) => (
        <AuditTextFilterField
          key={field.key}
          label={field.label}
          value={values[field.key]}
          placeholder={field.placeholder}
          onChange={(value) => {
            onChange(field.key, value);
          }}
        />
      ))}
      {DATE_FILTERS.map((field) => (
        <AuditDateFilterField
          key={field.key}
          label={field.label}
          value={values[field.key]}
          onChange={(value) => {
            onChange(field.key, value);
          }}
        />
      ))}
    </div>
  );
}
