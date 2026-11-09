import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Network } from "@/lib/network.types";

maplibregl.setWorkerUrl(workerUrl);

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function lineFeatures(path: number[], net: Network) {
  const coords = path
    .map((id) => net.pops.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => [p!.lng, p!.lat]);
  return {
    type: "FeatureCollection" as const,
    features:
      coords.length > 1
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
        : [],
  };
}

function buildData(net: Network, channelId: number | null) {
  const byId = new Map(net.pops.map((p) => [p.id, p]));
  const links = {
    type: "FeatureCollection" as const,
    features: net.links
      .filter((l) => byId.has(l.from_pop) && byId.has(l.to_pop))
      .map((l) => ({
        type: "Feature" as const,
        properties: { km: l.distance_km },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [byId.get(l.from_pop)!.lng, byId.get(l.from_pop)!.lat],
            [byId.get(l.to_pop)!.lng, byId.get(l.to_pop)!.lat],
          ],
        },
      })),
  };
  const pops = {
    type: "FeatureCollection" as const,
    features: net.pops.map((p) => ({
      type: "Feature" as const,
      properties: { id: p.id, name: p.name, city: p.city },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
    })),
  };
  const ch = net.channels.find((c) => c.id === channelId);
  return {
    links,
    pops,
    primary: lineFeatures(ch?.primary_path ?? [], net),
    secondary: lineFeatures(ch?.secondary_path ?? [], net),
  };
}

export default function NetworkMap({ network, channelId }: { network: Network; channelId: number | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const latest = useRef({ network, channelId });
  latest.current = { network, channelId };

  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [-40, -13],
      zoom: 5.5,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      const signal = cssVar("--signal") || "#38bdf8";
      const standby = cssVar("--standby") || "#f59e0b";
      const d = buildData(latest.current.network, latest.current.channelId);
      m.addSource("links", { type: "geojson", data: d.links });
      m.addSource("secondary", { type: "geojson", data: d.secondary });
      m.addSource("primary", { type: "geojson", data: d.primary });
      m.addSource("pops", { type: "geojson", data: d.pops });
      m.addLayer({ id: "links", type: "line", source: "links", paint: { "line-color": "#64748b", "line-width": 2, "line-opacity": 0.7 } });
      m.addLayer({ id: "secondary", type: "line", source: "secondary", paint: { "line-color": standby, "line-width": 4, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "primary", type: "line", source: "primary", paint: { "line-color": signal, "line-width": 5 } });
      m.addLayer({ id: "pops", type: "circle", source: "pops", paint: { "circle-radius": 7, "circle-color": signal, "circle-stroke-color": "#0f172a", "circle-stroke-width": 3 } });
      m.addLayer({
        id: "pop-labels",
        type: "symbol",
        source: "pops",
        layout: { "text-field": ["get", "name"], "text-size": 12, "text-offset": [0, 1.4], "text-anchor": "top" },
        paint: { "text-color": "#e2e8f0", "text-halo-color": "#0f172a", "text-halo-width": 1.5 },
      });
      m.on("click", "pops", (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as { name: string; city: string };
        const coords = (f.geometry as { coordinates: number[] }).coordinates as [number, number];
        new maplibregl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(`<strong>${escapeHtml(p.name)}</strong><br/><span style="opacity:.7">${escapeHtml(p.city)}</span>`)
          .addTo(m);
      });
      m.on("mouseenter", "pops", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pops", () => (m.getCanvas().style.cursor = ""));
      fit(m, latest.current.network, latest.current.channelId);
    });
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded() || !m.getSource("pops")) return;
    const d = buildData(network, channelId);
    (m.getSource("links") as maplibregl.GeoJSONSource).setData(d.links);
    (m.getSource("pops") as maplibregl.GeoJSONSource).setData(d.pops);
    (m.getSource("primary") as maplibregl.GeoJSONSource).setData(d.primary);
    (m.getSource("secondary") as maplibregl.GeoJSONSource).setData(d.secondary);
    fit(m, network, channelId);
  }, [network, channelId]);

  return <div ref={el} className="h-full w-full" />;
}

function fit(m: maplibregl.Map, net: Network, channelId: number | null) {
  const ch = net.channels.find((c) => c.id === channelId);
  const ids = ch ? [...ch.primary_path, ...ch.secondary_path] : net.pops.map((p) => p.id);
  const pts = net.pops.filter((p) => ids.includes(p.id));
  if (pts.length === 0) return;
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  m.fitBounds(b, { padding: 80, maxZoom: 9, duration: 600 });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
