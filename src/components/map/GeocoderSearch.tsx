"use client";

import { useState, useRef, useCallback, type RefObject } from "react";
import type { MapCanvasHandle } from "./MapCanvas";

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  place_id: number;
}

interface Props {
  mapRef: RefObject<MapCanvasHandle | null>;
}

export default function GeocoderSearch({ mapRef }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(q.trim())}`
        );
        if (!res.ok) return;
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleSelect = (result: NominatimResult) => {
    setQuery(result.display_name.split(",")[0]);
    setOpen(false);
    setResults([]);
    mapRef.current?.flyTo(parseFloat(result.lat), parseFloat(result.lon), 13);
  };

  return (
    <div className="absolute top-3 left-3 z-[1000] w-72">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search location…"
          className="w-full px-3 py-2 rounded-lg shadow-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {loading && (
          <span className="absolute right-3 top-2.5 text-gray-400 text-xs">
            …
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-y-auto text-sm">
          {results.map((r) => (
            <li
              key={r.place_id}
              onMouseDown={() => handleSelect(r)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer truncate"
              title={r.display_name}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
