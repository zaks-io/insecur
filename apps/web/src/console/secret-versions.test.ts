import { describe, expect, it } from "vitest";
import { parseSecretVersionsBody } from "./secret-versions.js";

const VERSION_HISTORY = {
  ok: true,
  data: {
    secretId: "sec_00000000000000000000000001",
    variableKey: "DATABASE_URL",
    versions: [
      {
        secretVersionId: "sv_00000000000000000000000002",
        versionNumber: 2,
        lifecycleState: "live",
        createdAt: "2026-06-24T01:00:00.000Z",
        publishedAt: "2026-06-24T01:00:00.000Z",
        isCurrent: true,
        isPublished: true,
        setAt: "2026-06-24T01:00:00.000Z",
        setActor: {
          actorType: "user",
          userId: "usr_00000000000000000000000011",
          details: {
            agentSessionId: "ags_00000000000000000000000011",
            harnessName: "agent.harness.cursor",
          },
        },
      },
    ],
  },
};

describe("parseSecretVersionsBody", () => {
  it("parses metadata-only version history with principal-chain actors", () => {
    expect(parseSecretVersionsBody(VERSION_HISTORY)).toEqual({
      secretId: "sec_00000000000000000000000001",
      variableKey: "DATABASE_URL",
      versions: [
        expect.objectContaining({
          secretVersionId: "sv_00000000000000000000000002",
          setActor: {
            actorType: "user",
            userId: "usr_00000000000000000000000011",
            details: {
              agentSessionId: "ags_00000000000000000000000011",
              harnessName: "agent.harness.cursor",
            },
          },
        }),
      ],
    });
    expect(JSON.stringify(VERSION_HISTORY)).not.toMatch(/ciphertext|valueUtf8|plaintext|password/i);
  });

  it("fails closed on malformed actor payloads", () => {
    expect(
      parseSecretVersionsBody({
        ok: true,
        data: {
          secretId: "sec_00000000000000000000000001",
          variableKey: "DATABASE_URL",
          versions: [{ setActor: { actorType: "robot" } }],
        },
      }),
    ).toBeNull();
  });
});
