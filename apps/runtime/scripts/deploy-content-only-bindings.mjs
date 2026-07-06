import { applyPublicDeployVarBindings } from "./deploy-content-only-public-vars.mjs";

export function prepareBindingsForSettingsPatch(existingBindings, desiredPublicVars) {
  const merged = applyPublicDeployVarBindings(existingBindings, desiredPublicVars);
  const updatedPlainTextNames = new Set(Object.keys(desiredPublicVars));
  const patchBindings = [];
  const seenNames = new Set();

  for (const binding of existingBindings) {
    seenNames.add(binding.name);

    if (binding.type === "plain_text" && updatedPlainTextNames.has(binding.name)) {
      patchBindings.push({
        name: binding.name,
        type: "plain_text",
        text: desiredPublicVars[binding.name],
      });
      continue;
    }

    patchBindings.push(inheritBinding(binding));
  }

  for (const [name, text] of Object.entries(desiredPublicVars)) {
    if (seenNames.has(name)) {
      continue;
    }

    patchBindings.push({
      name,
      type: "plain_text",
      text,
    });
  }

  return { merged, patchBindings };
}

export function publicDeployVarsAlreadyMatch(bindings, desiredPublicVars) {
  for (const [name, expectedText] of Object.entries(desiredPublicVars)) {
    const binding = bindings.find(
      (candidate) => candidate.name === name && candidate.type === "plain_text",
    );

    if (binding?.text !== expectedText) {
      return false;
    }
  }

  return true;
}

function inheritBinding(binding) {
  return {
    name: binding.name,
    type: "inherit",
  };
}
