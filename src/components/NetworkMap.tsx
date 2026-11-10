import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Network } from "@/lib/network.types";
import type { ZabbixStatus } from "@/server/zabbix.server";

maplibregl.setWorkerUrl(workerUrl);

function cssVar(name: string) {
  // MapLibre does not parse oklch(); resolve the token to rgb via a 1px canvas.
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!raw || !ctx) return "";
  ctx.fillStyle = raw;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function lineFeatures(path: number[], net: Network) {
  const coords = path
    .map((id) => net.pops.find((p) => p.id === id))
    .flatMap((p) => p ? [[p.lng, p.lat]] : []);
  return {
    type: "FeatureCollection" as const,
    features:
      coords.length > 1
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
        : [],
  };
}

function buildData(net: Network, channelId: number | null, z?: ZabbixStatus, m?: maplibregl.Map) {
  const byId = new Map(net.pops.map((p) => [p.id, p]));
  const links = {
    type: "FeatureCollection" as const,
    features: net.links
      .flatMap((l) => {
        const from = byId.get(l.from_pop);
        const to = byId.get(l.to_pop);
        if (!from || !to) return [];
        return [{
        type: "Feature" as const,
        properties: { km: l.distance_km },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [from.lng, from.lat],
            [to.lng, to.lat],
          ],
        },
        }];
      }),
  };
  // Group visually overlapping points without changing their stored coordinates.
  const groups: { anchor: Network["pops"][number]; members: Network["pops"] }[] = [];
  for (const p of net.pops) {
    const point = m?.project([p.lng, p.lat]);
    const group = groups.find(({ anchor }) => {
      if (!m || !point) return anchor.lng === p.lng && anchor.lat === p.lat;
      const other = m.project([anchor.lng, anchor.lat]);
      return Math.hypot(point.x - other.x, point.y - other.y) <= 22;
    });
    if (group) group.members.push(p);
    else groups.push({ anchor: p, members: [p] });
  }
  const rank = { none: 0, ok: 1, unknown: 2, warn: 3, down: 4 };
  const pops = {
    type: "FeatureCollection" as const,
    features: groups.map(({ anchor: p, members }) => {
      const states = members.map((member) => z?.enabled ? (z.byName[member.name]?.state ?? "unknown") : "none");
      const state = states.reduce((worst, current) => rank[current] > rank[worst] ? current : worst, "none");
      return {
      type: "Feature" as const,
      properties: {
        id: p.id,
        name: members.length > 1 ? `${members.length} equipamentos` : p.name,
        city: p.city,
        state,
        count: members.length,
        countLabel: members.length > 1 ? String(members.length) : "",
        ids: JSON.stringify(members.map((member) => member.id)),
      },
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      };
    }),
  };
  const ch = net.channels.find((c) => c.id === channelId);
  return {
    links,
    pops,
    primary: lineFeatures(ch?.primary_path ?? [], net),
    secondary: lineFeatures(ch?.secondary_path ?? [], net),
  };
}

export default function NetworkMap({
  network,
  channelId,
  zabbix,
}: {
  network: Network;
  channelId: number | null;
  zabbix?: ZabbixStatus | undefined;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef({ network, channelId, zabbix });
  latest.current = { network, channelId, zabbix };

  useEffect(() => {
    if (!el.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: el.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [-40, -13],
        zoom: 5.5,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
    m.on("error", (e) => console.error("Mapa:", e.error));
    map.current = m;
    m.addControl(new maplibregl.NavigationControl(), "top-right");
    m.on("load", () => {
      const signal = cssVar("--signal") || "#38bdf8";
      const standby = cssVar("--standby") || "#f59e0b";
      const online = cssVar("--online") || "#22c55e";
      const down = cssVar("--destructive") || "#ef4444";
      const d = buildData(latest.current.network, latest.current.channelId, latest.current.zabbix, m);
      m.addSource("links", { type: "geojson", data: d.links });
      m.addSource("secondary", { type: "geojson", data: d.secondary });
      m.addSource("primary", { type: "geojson", data: d.primary });
      m.addSource("pops", { type: "geojson", data: d.pops });
      m.addLayer({ id: "links", type: "line", source: "links", paint: { "line-color": "#64748b", "line-width": 2, "line-opacity": 0.7 } });
      m.addLayer({ id: "secondary", type: "line", source: "secondary", paint: { "line-color": standby, "line-width": 4, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "primary", type: "line", source: "primary", paint: { "line-color": signal, "line-width": 5 } });
      m.addLayer({ id: "pops", type: "circle", source: "pops", paint: { "circle-radius": ["case", [">", ["get", "count"], 1], 14, 7], "circle-color": ["match", ["get", "state"], "ok", online, "warn", standby, "down", down, "unknown", "#64748b", signal], "circle-stroke-color": "#0f172a", "circle-stroke-width": 3 } });
      m.addLayer({
        id: "pop-counts", type: "symbol", source: "pops",
        layout: { "text-field": ["get", "countLabel"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": cssVar("--foreground"), "text-halo-color": cssVar("--background"), "text-halo-width": 1 },
      });
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
        const ids = JSON.parse(String(f.properties?.ids ?? "[]")) as number[];
        const current = latest.current;
        const members = current.network.pops.filter((p) => ids.includes(p.id));
        const label: Record<string, string> = { ok: "Zabbix: sem alertas", warn: "Zabbix: alerta", down: "Zabbix: crítico", unknown: "Zabbix: host não encontrado" };
        const html = members.map((p) => {
          const status = current.zabbix?.enabled ? current.zabbix.byName[p.name] : undefined;
          const state = current.zabbix?.enabled ? (status?.state ?? "unknown") : "none";
          const extra = (label[state] ? `<br/><em>${label[state]}</em>` : "") + (status?.problems.slice(0, 5) ?? []).map((x) => `<br/>• ${escapeHtml(x.name)}`).join("");
          return `<section class="map-equipment"><strong>${escapeHtml(p.name)}</strong><br/><span class="map-equipment-city">${escapeHtml(p.city)}</span>${extra}</section>`;
        }).join("");
        const coords = (f.geometry as { coordinates: number[] }).coordinates as [number, number];
        new maplibregl.Popup({ offset: 12 })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(m);
      });
      m.on("mouseenter", "pops", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "pops", () => (m.getCanvas().style.cursor = ""));
      m.on("moveend", () => {
        const current = latest.current;
        (m.getSource("pops") as maplibregl.GeoJSONSource).setData(buildData(current.network, current.channelId, current.zabbix, m).pops);
      });
      fit(m, latest.current.network, latest.current.channelId);
    });
    return () => m.remove();
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded() || !m.getSource("pops")) return;
    const d = buildData(network, channelId, zabbix, m);
    (m.getSource("links") as maplibregl.GeoJSONSource).setData(d.links);
    (m.getSource("pops") as maplibregl.GeoJSONSource).setData(d.pops);
    (m.getSource("primary") as maplibregl.GeoJSONSource).setData(d.primary);
    (m.getSource("secondary") as maplibregl.GeoJSONSource).setData(d.secondary);
    fit(m, network, channelId);
  }, [network, channelId]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded() || !m.getSource("pops")) return;
    (m.getSource("pops") as maplibregl.GeoJSONSource).setData(buildData(network, channelId, zabbix, m).pops);
  }, [zabbix]);

  if (error)
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <div>
          <p className="mb-2 font-semibold text-foreground">Não foi possível desenhar o mapa neste navegador.</p>
          <p>Verifique se a "aceleração de hardware" (WebGL) está ativada no navegador.</p>
          <p className="mt-2 font-mono text-xs">{error}</p>
        </div>
      </div>
    );
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
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
