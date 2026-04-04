import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";

export const metadata: Metadata = {
  title: "Laser Map Maker",
  description:
    "Generate laser-cutter-ready SVG files from OpenStreetMap data. Three layers: land/water cut, road engrave, major road top cut.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}
