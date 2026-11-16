import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import type { Network } from "@/lib/network.types";
import type { ZabbixStatus } from "@/server/zabbix.server";
import { linkVisualState } from "@/lib/link-status";
import { displayPositions, equipmentType, isDwdmLink, mapLabel } from "@/lib/map-layout";

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

function lineFeatures(path: number[], positions: Map<number, [number, number]>) {
  const coords = path
    .flatMap((id) => { const p = positions.get(id); return p ? [p] : []; });
  return {
    type: "FeatureCollection" as const,
    features:
      coords.length > 1
        ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } }]
        : [],
  };
}

function buildData(net: Network, channelId: number | null, z?: ZabbixStatus, m?: maplibregl.Map) {
  const positions = displayPositions(net.pops, m);
  const byId = new Map(net.pops.map((p) => [p.id, p]));
  const links = {
    type: "FeatureCollection" as const,
    features: net.links
      .flatMap((l) => {
        const from = byId.get(l.from_pop);
        const to = byId.get(l.to_pop);
        if (!from || !to) return [];
        const state = linkVisualState(l, z, { from, to });
        return [{
        type: "Feature" as const,
         properties: { id: l.id, km: l.distance_km, state, dwdm: isDwdmLink(from, to), flowing: state === "up" || state === "unmonitored" },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            positions.get(from.id) ?? [from.lng, from.lat],
            positions.get(to.id) ?? [to.lng, to.lat],
          ],
        },
        }];
      }),
  };
  const rank: Record<string, number> = { down: 4, warn: 3, unknown: 2, ok: 1, none: 0 };
  const groups = new Map<string, Network["pops"]>();
  for (const p of net.pops) {
    const key = String(positions.get(p.id) ?? [p.lng, p.lat]);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const pops = {
    type: "FeatureCollection" as const,
    features: [...groups.values()].map((members) => {
      members.sort((a, b) => equipmentType(a.name).localeCompare(equipmentType(b.name)) || a.name.localeCompare(b.name));
      const states = members.map((p) => (z?.enabled ? (z.byName[p.name]?.state ?? "unknown") : "none"));
      const state = states.reduce((w, s) => ((rank[s] ?? 0) > (rank[w] ?? 0) ? s : w), states[0] ?? "none");
      const p = members[0];
      if (!p) throw new Error("Grupo de equipamentos vazio");
      return {
      type: "Feature" as const,
      properties: {
        id: p.id,
        name: p.name,
        city: p.city,
        state,
        dwdm: members.every((x) => equipmentType(x.name) !== "sw"),
        labelAnchor: "top",
        labelOffset: [0, 2],
        label: members.length > 1 ? `${mapLabel(p.name).split("\n").pop()} (${members.length})` : mapLabel(p.name),
        count: members.length,
        ping: !!z?.enabled && !z.error && members.some((x) => z.byName[x.name]?.pingDown),
        ids: JSON.stringify(members.map((x) => x.id)),
      },
      geometry: { type: "Point" as const, coordinates: positions.get(p.id) ?? [p.lng, p.lat] },
      };
    }),
  };
  const ch = net.channels.find((c) => c.id === channelId);
  return {
    links,
    pops,
    primary: lineFeatures(ch?.primary_path ?? [], positions),
    secondary: lineFeatures(ch?.secondary_path ?? [], positions),
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
  kind?: "sw" | "dwdm";
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
    let frame = 0;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastStep = -1;
    const updateBolts = (time: number) => {
      const source = m.getSource("dwdm-bolts") as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      const current = latest.current;
      const data = buildData(current.network, current.channelId, current.zabbix, m);
      const features = data.links.features.filter((f) => f.properties.dwdm && f.properties.flowing).flatMap((f) => {
        const start = f.geometry.coordinates[0];
        const end = f.geometry.coordinates[1];
        if (!start || !end) return [];
        const a = m.project(start as [number, number]);
        const b = m.project(end as [number, number]);
        const count = Math.max(1, Math.min(8, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 110)));
        return Array.from({ length: count }, (_, i) => {
          const t = ((time / 1800) + i / count) % 1;
          const p = m.unproject([a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t]);
          return { type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] } };
        });
      });
      source.setData({ type: "FeatureCollection", features });
    };
    const animate = (time: number) => {
      const step = Math.floor(time / 100) % 20;
      if (m.getLayer("link-flow") && step !== lastStep) {
        const offset = step / 5;
        m.setPaintProperty("link-flow", "line-dasharray", offset <= 3 ? [0, offset, 1, 3 - offset] : [offset - 3, 3, 4 - offset, 0]);
        lastStep = step;
        updateBolts(time);
      }
      if (m.getLayer("ping-alert")) {
        const t = (time % 1200) / 1200;
        m.setPaintProperty("ping-alert", "circle-radius", 9 + t * 16);
        m.setPaintProperty("ping-alert", "circle-opacity", 0.6 * (1 - t));
      }
      frame = requestAnimationFrame(animate);
    };
    const updateMotion = () => {
      cancelAnimationFrame(frame);
      if (motion.matches) {
        if (m.getLayer("link-flow")) m.setPaintProperty("link-flow", "line-dasharray", [1, 3]);
        if (m.getLayer("ping-alert")) { m.setPaintProperty("ping-alert", "circle-radius", 14); m.setPaintProperty("ping-alert", "circle-opacity", 0.5); }
        (m.getSource("dwdm-bolts") as maplibregl.GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
      } else frame = requestAnimationFrame(animate);
    };
    motion.addEventListener("change", updateMotion);
    m.on("load", () => {
      const signal = cssVar("--signal");
      const standby = cssVar("--standby");
      const online = cssVar("--online");
      const down = cssVar("--destructive");
      const neutral = cssVar("--map-link");
      const outline = cssVar("--map-outline");
      const fiber = cssVar("--dwdm");
      const flash = cssVar("--dwdm-flash");
      const canvas = document.createElement("canvas");
      canvas.width = 32; canvas.height = 40;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = flash;
        ctx.strokeStyle = fiber;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(19, 2); ctx.lineTo(6, 23); ctx.lineTo(15, 23);
        ctx.lineTo(11, 38); ctx.lineTo(27, 15); ctx.lineTo(18, 15);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        m.addImage("fiber-bolt", ctx.getImageData(0, 0, 32, 40), { pixelRatio: 2 });
      }
      const d = buildData(latest.current.network, latest.current.channelId, latest.current.zabbix, m);
      m.addSource("links", { type: "geojson", data: d.links });
      m.addSource("secondary", { type: "geojson", data: d.secondary });
      m.addSource("primary", { type: "geojson", data: d.primary });
      m.addSource("pops", { type: "geojson", data: d.pops });
      m.addSource("dwdm-bolts", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({ id: "links", type: "line", source: "links", paint: { "line-color": ["match", ["get", "state"], "up", online, "down", down, neutral], "line-width": 4, "line-opacity": 0.8 } });
      m.addLayer({ id: "secondary", type: "line", source: "secondary", paint: { "line-color": standby, "line-width": 4, "line-dasharray": [2, 2] } });
      m.addLayer({ id: "primary", type: "line", source: "primary", paint: { "line-color": signal, "line-width": 5 } });
      m.addLayer({ id: "link-flow", type: "line", source: "links", filter: ["==", ["get", "flowing"], true], paint: { "line-color": ["match", ["get", "state"], "up", online, signal], "line-width": 4, "line-dasharray": [1, 3] } });
      m.addLayer({ id: "dwdm-lines", type: "line", source: "links", filter: ["==", ["get", "dwdm"], true], paint: { "line-color": ["case", ["==", ["get", "state"], "unknown"], neutral, fiber], "line-width": 4, "line-opacity": 0.85 } });
      if (ctx) m.addLayer({ id: "dwdm-bolts", type: "symbol", source: "dwdm-bolts", layout: { "icon-image": "fiber-bolt", "icon-allow-overlap": true, "icon-ignore-placement": true } });
      m.addLayer({ id: "link-suspect", type: "line", source: "links", filter: ["==", ["get", "state"], "suspect"], paint: { "line-color": standby, "line-width": 4 } });
      m.addLayer({ id: "link-down", type: "line", source: "links", filter: ["==", ["get", "state"], "down"], paint: { "line-color": down, "line-width": 4 } });
      m.addLayer({ id: "ping-alert", type: "circle", source: "pops", filter: ["==", ["get", "ping"], true], paint: { "circle-radius": 14, "circle-color": down, "circle-opacity": 0.5 } });
      m.addLayer({ id: "pops", type: "circle", source: "pops", paint: { "circle-radius": 7, "circle-color": ["match", ["get", "state"], "ok", online, "warn", standby, "down", down, "unknown", neutral, signal], "circle-stroke-color": outline, "circle-stroke-width": 3 } });
      m.addLayer({
        id: "pop-labels",
        type: "symbol",
        source: "pops",
        layout: { "text-field": ["get", "label"], "text-size": 10, "text-max-width": 9, "text-offset": ["get", "labelOffset"], "text-anchor": ["get", "labelAnchor"], "text-allow-overlap": true },
        paint: { "text-color": cssVar("--map-label"), "text-halo-color": outline, "text-halo-width": 1.5 },
      });
      const showLink = (e: maplibregl.MapLayerMouseEvent) => {
        // Let point clicks list colocated equipment instead of replacing their popup.
        if (m.queryRenderedFeatures(e.point, { layers: ["pops"] }).length) return;
        const id = Number(e.features?.[0]?.properties?.["id"]);
        const current = latest.current;
        const link = current.network.links.find((l) => l.id === id);
        if (!link) return;
        const fromPop = current.network.pops.find((p) => p.id === link.from_pop);
        const toPop = current.network.pops.find((p) => p.id === link.to_pop);
        const from = fromPop?.name ?? "?";
        const to = toPop?.name ?? "?";
        const state = linkVisualState(link, current.zabbix, { from: fromPop, to: toPop });
        const labels = { up: link.monitor_kind === "padtec_loss" ? "Line sem alarme de perda de sinal" : "Porta ativa", down: "Ligação caída", unknown: "Estado indisponível", unmonitored: "Ligação cadastrada · sem monitoramento", suspect: "Suspeita · alarmes críticos nas duas pontas; falha do trecho não confirmada" };
        const message = current.zabbix?.byLink?.[String(id)]?.message;
        new maplibregl.Popup({ offset: 12 }).setLngLat(e.lngLat)
          .setHTML(`<strong>${escapeHtml(from)} ↔ ${escapeHtml(to)}</strong><br/>${link.distance_km} km<br/>${labels[state]}${message && message !== labels[state] ? `<br/>${escapeHtml(message)}` : ""}`).addTo(m);
      };
      m.on("click", "links", showLink);
      m.on("mouseenter", "links", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "links", () => (m.getCanvas().style.cursor = ""));
      m.on("click", "pops", (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f) return;
        const ids = JSON.parse(String(f.properties?.["ids"] ?? "[]")) as number[];
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
        const d = buildData(current.network, current.channelId, current.zabbix, m);
        (m.getSource("pops") as maplibregl.GeoJSONSource).setData(d.pops);
        (m.getSource("links") as maplibregl.GeoJSONSource).setData(d.links);
         (m.getSource("primary") as maplibregl.GeoJSONSource).setData(d.primary);
         (m.getSource("secondary") as maplibregl.GeoJSONSource).setData(d.secondary);
         if (!motion.matches) updateBolts(performance.now());
      });
      fit(m, latest.current.network, latest.current.channelId);
      updateMotion();
    });
    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener("change", updateMotion);
      m.remove();
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.getSource("pops") || !m.getSource("links")) return;
    const d = buildData(network, channelId, zabbix, m);
    (m.getSource("links") as maplibregl.GeoJSONSource).setData(d.links);
    (m.getSource("pops") as maplibregl.GeoJSONSource).setData(d.pops);
    (m.getSource("primary") as maplibregl.GeoJSONSource).setData(d.primary);
    (m.getSource("secondary") as maplibregl.GeoJSONSource).setData(d.secondary);
    fit(m, network, channelId);
  }, [network, channelId]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.getSource("pops") || !m.getSource("links")) return;
    const d = buildData(network, channelId, zabbix, m);
    (m.getSource("pops") as maplibregl.GeoJSONSource).setData(d.pops);
    (m.getSource("links") as maplibregl.GeoJSONSource).setData(d.links);
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
