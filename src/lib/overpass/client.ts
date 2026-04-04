// Fetches Overpass data directly from the browser (bypasses server proxy)
// so it works even when the Next.js server has no outbound internet access.

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// Simple in-memory cache keyed by query string
const memoryCache = new Map<string, unknown>();

export async function fetchOverpass(query: string): Promise<unknown> {
  const cacheKey = query.trim();
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  const errors: string[] = [];
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        errors.push(`${endpoint} → HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      memoryCache.set(cacheKey, data);
      return data;
    } catch (err) {
      errors.push(`${endpoint} → ${(err as Error).message}`);
    }
  }

  throw new Error(`All Overpass endpoints failed:\n${errors.join("\n")}`);
}
