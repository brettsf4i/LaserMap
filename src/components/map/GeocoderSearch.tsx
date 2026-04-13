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
  const [noResults, setNoResults] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      setNoResults(false);
      setSearchError(false);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setNoResults(false);
      setSearchError(false);
      try {
        const res = await fetch(
          `/api/geocode?q=${encodeURIComponent(q.trim())}`
        );
        if (!res.ok) {
          setSearchError(true);
          setOpen(true);
          return;
        }
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setNoResults(data.length === 0);
        setOpen(true);
      } catch {
        setSearchError(true);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, []);

  const handleSelect = (result: NominatimResult) => {
    setQuery(result.display_name.split(",")[0]);
    setOpen(false);
    setResults([]);
    setNoResults(false);
    mapRef.current?.flyTo(parseFloat(result.lat), parseFloat(result.lon), 13);
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setNoResults(false);
    setSearchError(false);
    setOpen(false);
  };

  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-80">
      <div className="relative">
        {/* Search icon */}
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M17 17l-3.5-3.5" />
          </svg>
        </span>

        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
          }}
          onFocus={() => (results.length > 0 || noResults || searchError) && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search for a city or address…"
          className="w-full pl-9 pr-8 py-2 rounded-lg shadow-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Loading spinner or clear button */}
        {loading ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="animate-spin h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </span>
        ) : query.length > 0 ? (
          <button
            onMouseDown={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Clear search"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="mt-1 bg-white rounded-lg shadow-lg border border-gray-200 text-sm overflow-hidden">
          {searchError ? (
            <div className="px-3 py-2.5 text-xs text-red-500 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Search unavailable. Check your connection and try again.
            </div>
          ) : noResults ? (
            <div className="px-3 py-2.5 text-xs text-gray-400 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" className="flex-shrink-0 opacity-50">
                <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
              </svg>
              No locations found — try a different search term.
            </div>
          ) : (
            <ul className="max-h-60 overflow-y-auto">
              {results.map((r) => (
                <li
                  key={r.place_id}
                  onMouseDown={() => handleSelect(r)}
                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer"
                  title={r.display_name}
                >
                  <p className="font-medium text-gray-800 truncate">
                    {r.display_name.split(",")[0]}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {r.display_name.split(",").slice(1).join(",").trim()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
