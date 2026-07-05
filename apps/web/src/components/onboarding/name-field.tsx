import { Input } from "@insecur/ui";

/** A labelled Display Name input with inline validation in the interface's voice. */
export function NameField({
  id,
  label,
  placeholder,
  value,
  onChange,
  error,
  helper,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  helper?: string;
}) {
  return (
    <div className="flex max-w-md flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        name={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={error === undefined ? undefined : `${id}-error`}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      {error === undefined ? (
        helper === undefined ? null : (
          <p className="text-xs leading-relaxed text-muted-foreground">{helper}</p>
        )
      ) : (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
