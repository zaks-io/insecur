import { Input } from "@insecur/ui";

function filterFieldClassName(): string {
  return "mt-1 block w-full min-w-0 border-2 border-ink bg-background px-3 py-2 font-mono text-xs";
}

export function AuditTextFilterField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <Input
        className="mt-1 font-mono text-xs"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}

export function AuditDateFilterField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-mono text-xs text-muted-foreground">{label}</span>
      <input
        type="datetime-local"
        className={filterFieldClassName()}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

export interface AuditFilterFieldValues {
  actorUserId: string;
  actorMachineIdentityId: string;
  projectId: string;
  environmentId: string;
  eventCode: string;
  createdAtFrom: string;
  createdAtTo: string;
}
