import {
  type CanarySentinel,
  type SentinelEncoding,
  type SentinelVariant,
} from "./sentinel-encodings.js";

/** Serialized HTTP egress from the First Value canary loop. */
export interface EgressHttpResponse {
  step: "write" | "issue" | "consume";
  status: number;
  headers: Record<string, string>;
  bodyText: string;
}

/** Captured serialized egress for the no-plaintext canary (ADR-0069 / INS-388). */
export interface EgressCapture {
  httpResponses: readonly EgressHttpResponse[];
  /** JSON.stringify of the Runtime consumeGrant RPC envelope. */
  rpcDeliveryPayloadJson: string;
}

export interface EgressSweepHit {
  surface: "egress";
  location: string;
  jsonPath?: string;
  encoding: SentinelEncoding;
  redactedPrefix: string;
}

const ALLOWED_DELIVERY_FIELD_SUFFIX = ".delivery.encodedValueUtf8";

function variantForEncoding(sentinel: CanarySentinel, encoding: SentinelEncoding): SentinelVariant {
  const variant = sentinel.variants.find((entry) => entry.encoding === encoding);
  if (!variant) {
    throw new Error(`Missing sentinel variant for encoding ${encoding}`);
  }
  return variant;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export function captureHttpResponse(
  step: EgressHttpResponse["step"],
  response: Response,
  bodyText: string,
): EgressHttpResponse {
  return {
    step,
    status: response.status,
    headers: headersToRecord(response.headers),
    bodyText,
  };
}

function findPatternPaths(value: unknown, pattern: string, path = ""): string[] {
  if (typeof value === "string") {
    return value.includes(pattern) ? [path || "<root>"] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findPatternPaths(entry, pattern, path ? `${path}[${index}]` : `[${index}]`),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const childPath = path ? `${path}.${key}` : key;
      return findPatternPaths(entry, pattern, childPath);
    });
  }

  return [];
}

function isAllowedEgressPath(encoding: SentinelEncoding, jsonPath: string | undefined): boolean {
  if (encoding !== "base64url" || jsonPath === undefined) {
    return false;
  }

  return (
    jsonPath === "delivery.encodedValueUtf8" || jsonPath.endsWith(ALLOWED_DELIVERY_FIELD_SUFFIX)
  );
}

function sweepSerializedJsonTree(
  location: string,
  serialized: string,
  sentinel: CanarySentinel,
): EgressSweepHit[] {
  const hits: EgressSweepHit[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    parsed = serialized;
  }

  for (const variant of sentinel.variants) {
    const paths =
      typeof parsed === "string"
        ? parsed.includes(variant.pattern)
          ? ["<text>"]
          : []
        : findPatternPaths(parsed, variant.pattern);

    for (const jsonPath of paths) {
      if (isAllowedEgressPath(variant.encoding, jsonPath)) {
        continue;
      }
      hits.push({
        surface: "egress",
        location,
        jsonPath,
        encoding: variant.encoding,
        redactedPrefix: sentinel.redactedPrefix,
      });
    }
  }

  return hits;
}

export function sweepEgressSurfaces(
  capture: EgressCapture,
  sentinel: CanarySentinel,
): EgressSweepHit[] {
  const hits: EgressSweepHit[] = [];

  for (const response of capture.httpResponses) {
    hits.push(
      ...sweepSerializedJsonTree(`http.${response.step}.body`, response.bodyText, sentinel),
      ...sweepSerializedJsonTree(
        `http.${response.step}.headers`,
        JSON.stringify(response.headers),
        sentinel,
      ),
    );
  }

  hits.push(...sweepSerializedJsonTree("rpc.delivery", capture.rpcDeliveryPayloadJson, sentinel));

  return hits;
}

export function formatEgressSweepHits(hits: EgressSweepHit[]): string {
  return hits
    .map((hit) => {
      const path = hit.jsonPath ? ` at ${hit.jsonPath}` : "";
      return `egress ${hit.location}${path} (${hit.encoding}, sentinel ${hit.redactedPrefix})`;
    })
    .join("\n");
}

export function findEgressEncodingHit(
  hits: EgressSweepHit[],
  encoding: SentinelEncoding,
): EgressSweepHit | undefined {
  return hits.find((hit) => hit.encoding === encoding);
}

/** Negative control: plant the raw sentinel in an unexpected HTTP response field. */
export function simulateEgressLeak(sentinel: CanarySentinel): {
  hits: EgressSweepHit[];
  rawHit: EgressSweepHit | undefined;
} {
  const rawVariant = variantForEncoding(sentinel, "raw");
  const expectedEncoded = variantForEncoding(sentinel, "base64url");
  const capture: EgressCapture = {
    httpResponses: [
      {
        step: "consume",
        status: 200,
        headers: {},
        bodyText: JSON.stringify({
          ok: true,
          delivery: {
            grantId: "igr_NEGATIVE_CONTROL",
            variableKey: "CANARY_NEGATIVE",
            encodedValueUtf8: expectedEncoded.pattern,
          },
          debug: rawVariant.pattern,
        }),
      },
    ],
    rpcDeliveryPayloadJson: JSON.stringify({
      ok: true,
      value: {
        ok: true,
        delivery: {
          grantId: "igr_NEGATIVE_CONTROL",
          variableKey: "CANARY_NEGATIVE",
          encodedValueUtf8: expectedEncoded.pattern,
        },
      },
    }),
  };

  const hits = sweepEgressSurfaces(capture, sentinel);
  return { hits, rawHit: findEgressEncodingHit(hits, "raw") };
}

/** Negative control: plant the raw sentinel in an unexpected Runtime RPC field. */
export function simulateRpcEgressLeak(sentinel: CanarySentinel): {
  hits: EgressSweepHit[];
  rawHit: EgressSweepHit | undefined;
} {
  const rawVariant = variantForEncoding(sentinel, "raw");
  const expectedEncoded = variantForEncoding(sentinel, "base64url");
  const capture: EgressCapture = {
    httpResponses: [],
    rpcDeliveryPayloadJson: JSON.stringify({
      ok: true,
      value: {
        ok: true,
        delivery: {
          grantId: "igr_NEGATIVE_CONTROL",
          variableKey: "CANARY_NEGATIVE",
          encodedValueUtf8: expectedEncoded.pattern,
        },
        debug: rawVariant.pattern,
      },
    }),
  };

  const hits = sweepEgressSurfaces(capture, sentinel);
  return { hits, rawHit: findEgressEncodingHit(hits, "raw") };
}
