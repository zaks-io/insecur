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

/** Captured serialized egress for the plaintext-containment canary (ADR-0069 / INS-388). */
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

const DELIVERY_PARENT_SEGMENT = "delivery";
const DELIVERY_VALUE_SEGMENT = "encodedValueUtf8";

type JsonPathSegments = readonly string[];

function isDeliveryEncodedValuePathSegments(segments: JsonPathSegments): boolean {
  if (segments.length < 2) {
    return false;
  }

  return segments.at(-2) === DELIVERY_PARENT_SEGMENT && segments.at(-1) === DELIVERY_VALUE_SEGMENT;
}

function isAllowedEgressPath(encoding: SentinelEncoding, segments: JsonPathSegments): boolean {
  if (encoding !== "base64url") {
    return false;
  }

  return isDeliveryEncodedValuePathSegments(segments);
}

/** Render carried path segments for diagnostics only; never parse this string back. */
function renderJsonPath(segments: JsonPathSegments): string {
  if (segments.length === 0) {
    return "<root>";
  }

  return segments.reduce<string>((path, segment) => {
    if (segment.startsWith("[")) {
      return `${path}${segment}`;
    }
    if (segment.includes(".")) {
      const bracketed = `["${segment.replace(/"/g, '\\"')}"]`;
      return path ? `${path}${bracketed}` : bracketed;
    }
    return path ? `${path}.${segment}` : segment;
  }, "");
}

function findPatternPathSegments(
  value: unknown,
  pattern: string,
  segments: JsonPathSegments = [],
): JsonPathSegments[] {
  if (typeof value === "string") {
    return value.includes(pattern) ? [segments] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      findPatternPathSegments(entry, pattern, [...segments, `[${index}]`]),
    );
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      findPatternPathSegments(entry, pattern, [...segments, key]),
    );
  }

  return [];
}

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
    const pathSegments: JsonPathSegments[] =
      typeof parsed === "string"
        ? parsed.includes(variant.pattern)
          ? [["<text>"]]
          : []
        : findPatternPathSegments(parsed, variant.pattern);

    for (const segments of pathSegments) {
      if (isAllowedEgressPath(variant.encoding, segments)) {
        continue;
      }
      hits.push({
        surface: "egress",
        location,
        jsonPath: renderJsonPath(segments),
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
