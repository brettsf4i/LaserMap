import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "Missing or too short query" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "LaserMapMaker/1.0 (https://github.com/laser-map-maker)",
        "Accept-Language": "en",
      },
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Nominatim error: HTTP ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Geocoding failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
