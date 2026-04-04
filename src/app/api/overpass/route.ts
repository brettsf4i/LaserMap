import { NextRequest, NextResponse } from "next/server";
import { LRUCache } from "lru-cache";

const cache = new LRUCache<string, string>({
  max: 50,
  ttl: 1000 * 60 * 15, // 15 minutes
});

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

const MAX_AREA_KM2 = 25;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    query: string;
    bbox: [number, number, number, number];
  };

  const [west, south, east, north] = body.bbox;
  const midLat = (south + north) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const widthKm = Math.abs(east - west) * 111.32 * cosLat;
  const heightKm = Math.abs(north - south) * 110.574;
  const areakm2 = widthKm * heightKm;

  if (areakm2 > MAX_AREA_KM2) {
    return NextResponse.json(
      {
        error: `Selected area too large (${areakm2.toFixed(1)} km²). Maximum is ${MAX_AREA_KM2} km². Please draw a smaller selection.`,
      },
      { status: 400 }
    );
  }

  const cacheKey = body.query.trim();
  const cached = cache.get(cacheKey);
  if (cached) {
    return new NextResponse(cached, {
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    });
  }

  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(body.query)}`,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
      const text = await res.text();
      cache.set(cacheKey, text);
      return new NextResponse(text, {
        headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    } catch (err) {
      lastError = err as Error;
    }
  }

  return NextResponse.json(
    { error: `Overpass API unavailable: ${lastError?.message}` },
    { status: 502 }
  );
}
