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
  return bindings.map((binding) => {
    if (binding.type !== "plain_text") {
      return binding;
    }

    const nextValue = desiredVars[binding.name];
    if (nextValue === undefined) {
      return binding;
    }

    return { ...binding, text: nextValue };
  });
}
