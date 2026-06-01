import { randomBytes } from "node:crypto";
import {
  environmentId,
  membershipId,
  organizationId,
  projectId,
  teamId,
  type EnvironmentId,
  type MembershipId,
  type OrganizationId,
  type ProjectId,
  type TeamId,
} from "@insecur/domain";

/** Crockford base32 alphabet (32 chars) for opaque ID bodies. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function generateOpaqueBody(length: number): string {
  const bytes = randomBytes(length);
  return Array.from(
    bytes,
    (byte) => CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length] ?? "0",
  ).join("");
}

export function generateOrganizationId(): OrganizationId {
  return organizationId.brand(`org_${generateOpaqueBody(26)}`);
}

export function generateProjectId(): ProjectId {
  return projectId.brand(`prj_${generateOpaqueBody(26)}`);
}

export function generateTeamId(): TeamId {
  return teamId.brand(`team_${generateOpaqueBody(26)}`);
}

export function generateMembershipId(): MembershipId {
  return membershipId.brand(`mem_${generateOpaqueBody(26)}`);
}

export function generateEnvironmentId(): EnvironmentId {
  return environmentId.brand(`env_${generateOpaqueBody(26)}`);
}
