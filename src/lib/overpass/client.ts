/**
 * Overpass fetch strategy
 * ───────────────────────
 * 1. PRIMARY: POST to our Next.js server proxy at /api/overpass.
 *    The server has better network access than the browser (no CORS limits,
 *    no browser firewall rules, server-side 15-min LRU cache).
 *    Timeout: 45 s (the server itself races all endpoints in parallel so this
 *    is effectively the worst-case time for a single endpoint to respond).
 *
 * 2. FALLBACK: If the proxy itself fails (server offline, dev without network),
 *    race all public endpoints directly from the browser in parallel.
 *    First success wins — no sequential 30-s waits.
 */

import type { BBox } from "@/lib/store/types";

const DIRECT_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// Session-level cache — avoids re-fetching when only slider settings change
const memoryCache = new Map<string, unknown>();

/**
 * Race all direct Overpass endpoints and return whichever responds first.
 * Used as fallback when the server proxy is unavailable.
 */
async function fetchDirect(query: string): Promise<unknown> {
  const TIMEOUT_MS = 120_000;

  const races = DIRECT_ENDPOINTS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${endpoint} → HTTP ${res.status}`);
    return res.json();
  });

  // Promise.any: resolves with the first success, rejects only if ALL fail
  return Promise.any(races).catch(() => {
    throw new Error(
      "Map data is unavailable. Check your internet connection and try again."
    );
  });
}

export async function fetchOverpass(query: string, bbox?: BBox): Promise<unknown> {
  const cacheKey = query.trim();
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  // ── 1. Try the server proxy first ─────────────────────────────────────────
  try {
    const res = await fetch("/api/overpass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        bbox: bbox ?? [0, 0, 0, 0],
      }),
      signal: AbortSignal.timeout(125_000),
    });

    if (res.ok) {
      const data = await res.json();
      // Check for application-level error from the proxy
      if (data && typeof data === "object" && "error" in data) {
        throw new Error((data as { error: string }).error);
      }
      memoryCache.set(cacheKey, data);
      return data;
    }

    // 4xx from proxy (e.g. area too large) — propagate directly, don't fallback
    if (res.status >= 400 && res.status < 500) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    }

    // 5xx — proxy itself failed, fall through to direct
    console.warn(`[overpass] proxy returned ${res.status}, falling back to direct`);
  } catch (err) {
    // If we explicitly threw (area too large etc.), re-throw immediately
    if (err instanceof Error && !err.message.includes("fetch")) throw err;
    console.warn("[overpass] proxy unavailable, falling back to direct:", (err as Error).message);
  }

  // ── 2. Fallback: race all public endpoints directly ────────────────────────
  const data = await fetchDirect(query);
  memoryCache.set(cacheKey, data);
  return data;
}
