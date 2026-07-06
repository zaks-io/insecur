export const CLOUDFLARE_API_TIMEOUT_MS = 10_000;

export function createCloudflareJson(apiToken, fetchFn) {
  return async function cloudflareJson(method, apiPath, init = {}) {
    const response = await fetchCloudflareResponse({
      fetchFn,
      apiToken,
      method,
      apiPath,
      init,
    });
    const text = await response.text();
    const payload = parseCloudflarePayload({ text, method, apiPath, status: response.status });
    assertCloudflareSuccess({ response, payload, method, apiPath, text });
    return payload.result;
  };
}

async function fetchCloudflareResponse({ fetchFn, apiToken, method, apiPath, init }) {
  try {
    return await fetchFn(`https://api.cloudflare.com/client/v4${apiPath}`, {
      method,
      ...init,
      signal: init.signal ?? AbortSignal.timeout(CLOUDFLARE_API_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...init.headers,
      },
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.code === "ABORT_ERR") {
      throw new Error(
        `Cloudflare ${method} ${apiPath} timed out after ${CLOUDFLARE_API_TIMEOUT_MS}ms.`,
        { cause: error },
      );
    }
    throw error;
  }
}

function parseCloudflarePayload({ text, method, apiPath, status }) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Cloudflare ${method} ${apiPath} failed with HTTP ${status}: non-JSON response (${summarizeResponseBody(text)})`,
      { cause: error },
    );
  }
}

function assertCloudflareSuccess({ response, payload, method, apiPath, text }) {
  if (response.ok && payload.success !== false) {
    return;
  }

  const messages = (payload.errors ?? [])
    .map((error) => `${error.code ?? "unknown"} ${error.message ?? ""}`.trim())
    .join("; ");
  throw new Error(
    `Cloudflare ${method} ${apiPath} failed with HTTP ${response.status}: ${messages || response.statusText || summarizeResponseBody(text)}`,
  );
}

function summarizeResponseBody(text) {
  const singleLine = text.replace(/\s+/gu, " ").trim();
  if (singleLine.length === 0) {
    return "empty body";
  }

  return singleLine.length > 120 ? `${singleLine.slice(0, 120)}…` : singleLine;
}
