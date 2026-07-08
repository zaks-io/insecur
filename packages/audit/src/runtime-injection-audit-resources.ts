import {
  parseOpaqueResourceId,
  type InjectionGrantId,
  type SecretVersionId,
} from "@insecur/domain";

export function injectionGrantAuditResource(grantId: InjectionGrantId) {
  const parsed = parseOpaqueResourceId(grantId, "igr");
  if (!parsed.ok) {
    return {};
  }
  return {
    resource: {
      type: "injection_grant" as const,
      id: parsed.value,
    },
  };
}

export function secretVersionAuditRelatedResource(secretVersionId: SecretVersionId) {
  const parsed = parseOpaqueResourceId(secretVersionId, "sv");
  if (!parsed.ok) {
    return {};
  }
  return {
    relatedResource: {
      type: "secret_version" as const,
      id: parsed.value,
    },
  };
}
