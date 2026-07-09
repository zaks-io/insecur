export const PUBLIC_PLAIN_TEXT_DEPLOY_VAR_NAMES = [
  "SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_RELEASE",
  "SENTRY_SERVICE",
  "SENTRY_TRACES_SAMPLE_RATE",
];

export const REQUIRED_PUBLIC_PLAIN_TEXT_DEPLOY_VAR_NAMES = ["SENTRY_RELEASE"];

export function pickDesiredPublicDeployVars(vars = {}) {
  const desired = {};

  for (const name of PUBLIC_PLAIN_TEXT_DEPLOY_VAR_NAMES) {
    const value = vars[name];
    if (typeof value === "string" && value.trim().length > 0) {
      desired[name] = value.trim();
    }
  }

  return desired;
}

export function applyPublicDeployVarBindings(bindings, desiredVars) {
  const merged = [...bindings];
  const bindingIndexByName = new Map(merged.map((binding, index) => [binding.name, index]));

  for (const [name, text] of Object.entries(desiredVars)) {
    const index = bindingIndexByName.get(name);

    if (index === undefined) {
      merged.push(createPlainTextBinding(name, text));
      bindingIndexByName.set(name, merged.length - 1);
      continue;
    }

    const existing = merged[index];
    if (existing.type === "plain_text") {
      merged[index] = { ...existing, text };
    }
  }

  return merged;
}

export function ensureRequiredPublicDeployBindings(bindings, desiredVars) {
  const merged = applyPublicDeployVarBindings(bindings, desiredVars);

  for (const name of REQUIRED_PUBLIC_PLAIN_TEXT_DEPLOY_VAR_NAMES) {
    const expected = desiredVars[name];
    const binding = merged.find(
      (candidate) => candidate.name === name && candidate.type === "plain_text",
    );

    if (!expected || binding?.text !== expected) {
      throw new Error(
        `Content-only deploy failed to prepare required public plain-text binding ${name}.`,
      );
    }
  }

  return merged;
}

export function mergePublicDeployVarBindings(bindings, desiredVars) {
  return applyPublicDeployVarBindings(bindings, desiredVars);
}

function createPlainTextBinding(name, text) {
  return {
    name,
    type: "plain_text",
    text,
  };
}
