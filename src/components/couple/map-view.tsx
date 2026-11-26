"use client";

import * as React from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";

export type MapPlace = { id: string; name: string; lat: number; lon: number; kind: "visited" | "dream" };

/**
 * OpenStreetMap via Leaflet. Only tiles are loaded from tile.openstreetmap.org
 * (with attribution); places come from your own list, never from geolocation.
 */
export default function MapView({ places, focus, onSelect }: { places: MapPlace[]; focus: string | null; onSelect: (id: string) => void }) {
  const host = React.useRef<HTMLDivElement>(null);
  const map = React.useRef<LMap | null>(null);
  const layer = React.useRef<LayerGroup | null>(null);
  const L = React.useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void import("leaflet").then((mod) => {
      if (!alive || !host.current) return;
      L.current = mod;
      const m = mod.map(host.current, { worldCopyJump: true, zoomControl: true, attributionControl: true }).setView([30, 10], 2);
      mod.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
      }).addTo(m);
      layer.current = mod.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  React.useEffect(() => {
    const mod = L.current;
    const g = layer.current;
    if (!ready || !mod || !g) return;
    g.clearLayers();
    for (const p of places) {
      mod
        .circleMarker([p.lat, p.lon], { radius: 8, weight: 2, color: "#ffffff", fillColor: p.kind === "visited" ? "#b3476a" : "#7b6bc4", fillOpacity: 0.95 })
        .bindTooltip(p.name)
        .on("click", () => onSelect(p.id))
        .addTo(g);
    }
    if (places.length && !focus) {
      const b = mod.latLngBounds(places.map((p) => [p.lat, p.lon] as [number, number]));
      map.current?.fitBounds(b, { padding: [40, 40], maxZoom: 6 });
    }
  }, [ready, places, focus, onSelect]);

  React.useEffect(() => {
    const p = places.find((x) => x.id === focus);
    if (ready && p) map.current?.flyTo([p.lat, p.lon], 8, { duration: 0.8 });
  }, [ready, focus, places]);

  return <div ref={host} className="absolute inset-0 z-0" role="application" aria-label="Weltkarte mit euren Orten" />;
}
