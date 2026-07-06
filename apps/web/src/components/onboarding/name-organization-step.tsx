import { Button } from "@insecur/ui";
import { useState, type SyntheticEvent } from "react";
import { workspaceNameError } from "../../onboarding/provisioning.js";
import { NameField } from "./name-field.js";
import { StepPanel } from "./step-panel.js";

const ERRORS = {
  empty: "Give your organization a name.",
  invalid: "Names need at least one visible character and at most 200.",
} as const;

/** Step 1: name the Personal Organization (create-only, ADR-0063). */
export function NameOrganizationStep({
  value,
  onChange,
  onContinue,
}: {
  value: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState<string>();

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const issue = workspaceNameError(value);
    if (issue !== undefined) {
      setError(ERRORS[issue]);
      return;
    }
    onContinue();
  };

  return (
    <StepPanel
      title="Name your organization"
      intro="Two names and a couple of terminal commands from now, you'll have a working setup. First: your Personal Organization. It starts as yours alone and can grow into a team."
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <NameField
          id="organization-name"
          label="Organization name"
          placeholder="Your name or your team's"
          value={value}
          onChange={onChange}
          error={error}
          helper="Created once, at the end of setup. Pick something you'll recognize in audit logs."
        />
        <div>
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </StepPanel>
  );
}
