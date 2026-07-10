import { Button } from "@insecur/ui";
import type { SyntheticEvent } from "react";
import {
  blindSecretWriteReceiptRows,
  type BlindSecretWriteReceipt,
} from "../../onboarding/blind-secret-write.js";
import type { WizardErrorVoice } from "../../onboarding/wizard-voice.js";
import { FailureNotice } from "./failure-notice.js";
import { MetadataReceipt } from "./metadata-receipt.js";
import { NameField } from "./name-field.js";
import { StepPanel } from "./step-panel.js";

export function BlindSecretReceiptView({
  receipt,
  onContinue,
}: {
  receipt: BlindSecretWriteReceipt;
  onContinue: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-6 py-6">
        <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
          Secret stored.
        </h2>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground">
          The value never left your input over TLS and does not appear below. Only metadata is
          shown.
        </p>
      </div>
      <MetadataReceipt rows={blindSecretWriteReceiptRows(receipt)} />
      <div className="px-6 py-5">
        <Button type="button" onClick={onContinue}>
          Continue to CLI handoff
        </Button>
      </div>
    </div>
  );
}

function SecretValueField({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="flex max-w-md flex-col gap-2">
      <label htmlFor="secret-value" className="text-sm font-medium">
        Secret value
      </label>
      <input
        id="secret-value"
        name="secret-value"
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
        className="rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
        placeholder="Paste your provider-issued value"
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Paste is first-class. The value is masked and never echoed back.
      </p>
    </div>
  );
}

function BlindSecretWriteActions({
  submitting,
  onSkip,
}: {
  submitting: boolean;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={submitting}>
        {submitting ? "Writing…" : "Write secret"}
      </Button>
      <Button type="button" variant="outline" onClick={onSkip}>
        Skip for now
      </Button>
    </div>
  );
}

function GenerateModeToggle({
  generateMode,
  onGenerateModeChange,
}: {
  generateMode: boolean;
  onGenerateModeChange: (value: boolean) => void;
}) {
  return (
    <label className="flex max-w-md items-center gap-3 text-sm">
      <input
        type="checkbox"
        checked={generateMode}
        onChange={(event) => {
          onGenerateModeChange(event.target.checked);
        }}
        className="size-4 border border-border"
      />
      Generate instead (value created server-side, never shown here)
    </label>
  );
}

export function BlindSecretWriteForm({
  variableKey,
  generateMode,
  value,
  submitting,
  failure,
  onVariableKeyChange,
  onGenerateModeChange,
  onValueChange,
  onSubmit,
  onSkip,
}: {
  variableKey: string;
  generateMode: boolean;
  value: string;
  submitting: boolean;
  failure: WizardErrorVoice | undefined;
  onVariableKeyChange: (value: string) => void;
  onGenerateModeChange: (value: boolean) => void;
  onValueChange: (value: string) => void;
  onSubmit: (event: SyntheticEvent) => void;
  onSkip: () => void;
}) {
  return (
    <StepPanel
      title="Write your first secret"
      intro="Optional, but it lets the CLI handoff skip the write command. Paste a provider-issued value or let the server generate one; either way, only a Metadata Receipt comes back."
    >
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-5">
        <NameField
          id="variable-key"
          label="Variable key"
          placeholder="APP_SECRET"
          value={variableKey}
          onChange={onVariableKeyChange}
        />
        <GenerateModeToggle
          generateMode={generateMode}
          onGenerateModeChange={onGenerateModeChange}
        />
        {generateMode ? null : <SecretValueField value={value} onValueChange={onValueChange} />}
        {failure === undefined ? null : (
          <FailureNotice failure={failure} onContinueToHandoff={onSkip} />
        )}
        <BlindSecretWriteActions submitting={submitting} onSkip={onSkip} />
      </form>
    </StepPanel>
  );
}
