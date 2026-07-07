import { useState, type SyntheticEvent } from "react";
import { csrfTokenFromCookieHeader } from "../../onboarding/csrf.js";
import {
  type BlindSecretWriteReceipt,
  type BlindSecretWriteOutcome,
} from "../../onboarding/blind-secret-write.js";
import type { ProvisionedWorkspace } from "../../onboarding/provisioning.js";
import { blindSecretWriteErrorVoice } from "../../onboarding/wizard-voice.js";
import { writeOnboardingBlindSecret } from "../../server/onboarding-blind-secret.js";
import { BlindSecretReceiptView, BlindSecretWriteForm } from "./first-secret-step-parts.js";

const DEFAULT_VARIABLE_KEY = "APP_SECRET";

interface FirstSecretStepProps {
  workspace: ProvisionedWorkspace;
  onSkip: () => void;
  onWritten: () => void;
}

async function submitBlindWrite(data: {
  workspace: ProvisionedWorkspace;
  variableKey: string;
  mode: "value" | "generate";
  value?: string;
}): Promise<BlindSecretWriteOutcome> {
  try {
    return await writeOnboardingBlindSecret({
      data: {
        csrfToken: csrfTokenFromCookieHeader(document.cookie) ?? "",
        workspace: data.workspace,
        variableKey: data.variableKey,
        mode: data.mode,
        ...(data.value === undefined ? {} : { value: data.value }),
      },
    });
  } catch {
    return { ok: false as const, code: "web.unexpected_response" as const };
  }
}

/**
 * Step 4: optional blind secret write (INS-379, ADR-0052). Masked paste or server-side generate;
 * confirmation is a Metadata Receipt only.
 */
export function FirstSecretStep({ workspace, onSkip, onWritten }: FirstSecretStepProps) {
  const [variableKey, setVariableKey] = useState(DEFAULT_VARIABLE_KEY);
  const [generateMode, setGenerateMode] = useState(true);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReturnType<typeof blindSecretWriteErrorVoice>>();
  const [receipt, setReceipt] = useState<BlindSecretWriteReceipt | undefined>();

  const submit = async (event: SyntheticEvent) => {
    event.preventDefault();
    setFailure(undefined);
    setSubmitting(true);
    const outcome = await submitBlindWrite({
      workspace,
      variableKey: variableKey.trim(),
      mode: generateMode ? "generate" : "value",
      ...(generateMode ? {} : { value }),
    });
    setSubmitting(false);
    if (outcome.ok) {
      setReceipt(outcome.receipt);
      return;
    }
    setFailure(blindSecretWriteErrorVoice(outcome.code));
  };

  if (receipt !== undefined) {
    return <BlindSecretReceiptView receipt={receipt} onContinue={onWritten} />;
  }

  return (
    <BlindSecretWriteForm
      variableKey={variableKey}
      generateMode={generateMode}
      value={value}
      submitting={submitting}
      failure={failure}
      onVariableKeyChange={setVariableKey}
      onGenerateModeChange={setGenerateMode}
      onValueChange={setValue}
      onSubmit={(event) => {
        void submit(event);
      }}
      onSkip={onSkip}
    />
  );
}
