import { describe, expect, it } from "vitest";

import {
  assertCliConnectionsListMetadataOnly,
  assertCliConnectionStatusNotFound,
  CLI_CONNECTION_NOT_FOUND_EXIT_CODE,
} from "../src/cli-connections-metadata-assertions";

const ORG_ID = "org_TEST00000000000000000000AB";
const CONNECTION_ID = "conn_TEST00000000000000000000AB";

function metadataOnlyConnection(): Record<string, unknown> {
  return {
    id: CONNECTION_ID,
    organizationId: ORG_ID,
    provider: "github",
    connectionMethod: "github-app",
    displayName: "Prod GitHub",
    status: "connected",
    statusReasonCode: null,
    hasActiveCredential: true,
    setupUserId: "usr_TEST00000000000000000000AB",
    lastValidationCheckedAt: "2026-07-09T00:00:00.000Z",
    lastValidationOutcome: "success",
    lastValidationReasonCode: null,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
  };
}

function notFoundErrorEnvelope(): string {
  return JSON.stringify({
    ok: false,
    error: {
      code: "connection.not_found",
      message: "App connection not found.",
      retryable: false,
    },
  });
}

describe("cli connections list metadata assertions", () => {
  it("accepts a metadata-only connections list envelope for the smoke org", () => {
    const connections = assertCliConnectionsListMetadataOnly(
      { ok: true, data: { connections: [metadataOnlyConnection()] } },
      "CLI connections list",
      ORG_ID,
    );
    expect(connections).toHaveLength(1);
  });

  it("accepts an empty connections list (unseeded smoke org)", () => {
    const connections = assertCliConnectionsListMetadataOnly(
      { ok: true, data: { connections: [] } },
      "CLI connections list",
      ORG_ID,
    );
    expect(connections).toHaveLength(0);
  });

  it("rejects a connection scoped to a different organization", () => {
    expect(() => {
      assertCliConnectionsListMetadataOnly(
        {
          ok: true,
          data: { connections: [{ ...metadataOnlyConnection(), organizationId: "org_OTHER" }] },
        },
        "CLI connections list",
        ORG_ID,
      );
    }).toThrow(/organizationId/);
  });

  it("rejects a connection carrying a credential-bearing key", () => {
    expect(() => {
      assertCliConnectionsListMetadataOnly(
        {
          ok: true,
          data: { connections: [{ ...metadataOnlyConnection(), accessToken: "leaked" }] },
        },
        "CLI connections list",
        ORG_ID,
      );
    }).toThrow(/unexpected key: accessToken/);
  });

  it("rejects a connection with a non-opaque id", () => {
    expect(() => {
      assertCliConnectionsListMetadataOnly(
        { ok: true, data: { connections: [{ ...metadataOnlyConnection(), id: "not-opaque" }] } },
        "CLI connections list",
        ORG_ID,
      );
    }).toThrow(/opaque conn_ resource id/);
  });

  it("rejects a status success envelope masquerading as a list", () => {
    expect(() => {
      assertCliConnectionsListMetadataOnly(
        { ok: true, data: { connection: metadataOnlyConnection() } },
        "CLI connections list",
        ORG_ID,
      );
    }).toThrow(/connections must be an array/);
  });
});

describe("cli connections status not-found assertions", () => {
  it("accepts the stable not-found error envelope on stderr with exit 5", () => {
    expect(() => {
      assertCliConnectionStatusNotFound({
        exitCode: CLI_CONNECTION_NOT_FOUND_EXIT_CODE,
        label: "CLI connections status",
        stderr: notFoundErrorEnvelope(),
        stdout: "",
      });
    }).not.toThrow();
  });

  it("rejects a wrong exit code", () => {
    expect(() => {
      assertCliConnectionStatusNotFound({
        exitCode: 0,
        label: "CLI connections status",
        stderr: notFoundErrorEnvelope(),
        stdout: "",
      });
    }).toThrow(/expected exit code 5/);
  });

  it("rejects success JSON leaking onto stdout", () => {
    expect(() => {
      assertCliConnectionStatusNotFound({
        exitCode: CLI_CONNECTION_NOT_FOUND_EXIT_CODE,
        label: "CLI connections status",
        stderr: notFoundErrorEnvelope(),
        stdout: '{"ok":true}',
      });
    }).toThrow(/must not write success JSON to stdout/);
  });

  it("rejects a different error code", () => {
    const wrongCode = JSON.stringify({
      ok: false,
      error: { code: "auth.required", message: "Auth required.", retryable: false },
    });
    expect(() => {
      assertCliConnectionStatusNotFound({
        exitCode: CLI_CONNECTION_NOT_FOUND_EXIT_CODE,
        label: "CLI connections status",
        stderr: wrongCode,
        stdout: "",
      });
    }).toThrow(/error.code/);
  });

  it("rejects empty stderr", () => {
    expect(() => {
      assertCliConnectionStatusNotFound({
        exitCode: CLI_CONNECTION_NOT_FOUND_EXIT_CODE,
        label: "CLI connections status",
        stderr: "   ",
        stdout: "",
      });
    }).toThrow(/no JSON error output on stderr/);
  });
});
