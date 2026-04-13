export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, string>({
  max: 50,
  ttl: 1000 * 60 * 15, // 15 minutes
});

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const MAX_AREA_KM2 = 500;
const ENDPOINT_TIMEOUT_MS = 120_000;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    bbox: [number, number, number, number];
  };

  // ── Area guard ─────────────────────────────────────────────────────────────
  const [west, south, east, north] = body.bbox;
  if (body.bbox.some((v) => v !== 0)) {
    const midLat = (south + north) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    const widthKm = Math.abs(east - west) * 111.32 * cosLat;
    const heightKm = Math.abs(north - south) * 110.574;
    const areakm2 = widthKm * heightKm;
    if (areakm2 > MAX_AREA_KM2) {
      return NextResponse.json(
        {
          error: `Selection too large (${areakm2.toFixed(1)} km²). Max ${MAX_AREA_KM2} km². Draw a smaller area.`,
        },
        { status: 400 }
      );
    }
  }

  // ── Cache hit ──────────────────────────────────────────────────────────────
  const cacheKey = body.query.trim();
  const cached = cache.get(cacheKey);
  if (cached) {
    return new NextResponse(cached, {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  // ── Race all endpoints in parallel — first success wins ───────────────────
  // This replaces the old sequential loop where each 30-s timeout had to
  // expire before trying the next endpoint.
  const races = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(body.query)}`,
      signal: AbortSignal.timeout(ENDPOINT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${endpoint} → HTTP ${res.status}`);
    const text = await res.text();
    // Sanity-check: Overpass always returns JSON starting with "{"
    if (!text.trim().startsWith("{")) {
      throw new Error(`${endpoint} → unexpected response format`);
    }
    return text;
  });

  try {
    const text = await Promise.any(races);
    cache.set(cacheKey, text);
    return new NextResponse(text, {
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Map data is temporarily unavailable. All servers failed to respond. " +
          "Wait 30 seconds and try again, or try a different area.",
      },
      { status: 502 }
    );
  }
}
