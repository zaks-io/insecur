export const PUBLIC_PLAIN_TEXT_DEPLOY_VAR_NAMES = [
  "SENTRY_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_RELEASE",
  "SENTRY_SERVICE",
];

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

export function mergePublicDeployVarBindings(bindings, desiredVars) {
  const merged = bindings.map((binding) => {
    if (binding.type !== "plain_text") {
      return binding;
    }

    const nextValue = desiredVars[binding.name];
    if (nextValue === undefined) {
      return binding;
    }

    return { ...binding, text: nextValue };
  });

  const existingPlainTextNames = new Set(
    merged.filter((binding) => binding.type === "plain_text").map((binding) => binding.name),
  );

  for (const [name, text] of Object.entries(desiredVars)) {
    if (existingPlainTextNames.has(name)) {
      continue;
    }

    merged.push({
      name,
      type: "plain_text",
      text,
    });
  }

  return merged;
}
