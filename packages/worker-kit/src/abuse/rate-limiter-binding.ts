/** Cloudflare Workers Rate Limiting binding (`env.*.limit`). */
export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Pass-through limiter for local tests and environments without wrangler ratelimit bindings. */
export function createPassThroughRateLimiter(): RateLimiterBinding {
  return {
    limit: () => Promise.resolve({ success: true }),
  };
}

/** In-memory limiter for unit tests. */
export function createInMemoryRateLimiter(limit: number): RateLimiterBinding {
  const counts = new Map<string, number>();
  return {
    limit: ({ key }) => {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return Promise.resolve({ success: next <= limit });
    },
  };
}
