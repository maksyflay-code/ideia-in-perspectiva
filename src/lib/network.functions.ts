import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Network, Pop, Link, Channel } from "./network.types";

async function db() {
  const { getDb } = await import("@/server/db.server");
  return getDb();
}
async function auth() {
  return import("@/server/auth.server");
}

export const getNetwork = createServerFn({ method: "GET" }).handler(async (): Promise<Network> => {
  await (await auth()).requireViewer();
  const d = await db();
  const pops = d.prepare("SELECT * FROM pops ORDER BY name").all() as Pop[];
  const links = d.prepare("SELECT * FROM links ORDER BY id").all() as Link[];
  const channels = (
    d.prepare("SELECT * FROM channels ORDER BY name").all() as {
      id: number;
      name: string;
      primary_path: string;
      secondary_path: string;
    }[]
  ).map(
    (c): Channel => ({
      id: c.id,
      name: c.name,
      primary_path: JSON.parse(c.primary_path),
      secondary_path: JSON.parse(c.secondary_path),
    }),
  );
  return { pops: pops.map((p) => ({ ...p })), links: links.map((l) => ({ ...l })), channels };
});

export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const a = await auth();
  const u = await a.currentUser();
  return { user: u?.role === "admin" ? u.user : null, viewer: u?.user ?? null };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator(z.object({ user: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const a = await auth();
    const role = a.checkCredentials(data.user, data.password);
    if (!role) return { ok: false as const, role: null };
    await a.startSession(data.user, role);
    return { ok: true as const, role };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  (await auth()).endSession();
  return { ok: true };
});

const popSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  notes: z.string().max(500).default(""),
});

export const savePop = createServerFn({ method: "POST" })
  .inputValidator(popSchema)
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    if (data.id)
      d.prepare("UPDATE pops SET name=?, city=?, lat=?, lng=?, notes=? WHERE id=?").run(
        data.name, data.city, data.lat, data.lng, data.notes, data.id,
      );
    else
      d.prepare("INSERT INTO pops (name, city, lat, lng, notes) VALUES (?,?,?,?,?)").run(
        data.name, data.city, data.lat, data.lng, data.notes,
      );
    return { ok: true };
  });

const linkSchema = z
  .object({
    id: z.number().int().optional(),
    from_pop: z.number().int(),
    to_pop: z.number().int(),
    distance_km: z.number().min(0).max(100000),
    zabbix_host: z.string().max(200).default(""),
    zabbix_item: z.string().max(200).default(""),
    monitor_kind: z.enum(["interface", "padtec_loss"]).default("interface"),
    optical_down_value: z.enum(["", "0", "1"]).default(""),
  })
  .refine((v) => v.from_pop !== v.to_pop, { message: "Origem e destino devem ser diferentes" });

export const saveLink = createServerFn({ method: "POST" })
  .inputValidator(linkSchema)
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    if (data.monitor_kind === "padtec_loss") {
      const { PADTEC_MONITOR_HOST } = await import("./optical-status");
      if (data.zabbix_host !== PADTEC_MONITOR_HOST || !/^\d+$/.test(data.zabbix_item) || !data.optical_down_value)
        throw new Error("Selecione a Line Padtec e confirme o valor de perda de sinal");
      const endpoints = [data.from_pop, data.to_pop].map((id) => d.prepare("SELECT name FROM pops WHERE id=?").get(id) as { name: string } | undefined);
      if (!endpoints.every((p) => p?.name.startsWith("padtec-"))) throw new Error("Alarme Padtec exige dois equipamentos Padtec");
      const zs = await import("@/server/zabbix.server");
      const items = await zs.listOpticalItems();
      const selected = items.find((i) => i.itemid === data.zabbix_item);
      if (!selected) throw new Error("Alarme Loss da Line não encontrado no Zabbix");
      const source = endpoints[0];
      const target = endpoints[1];
      if (!source || !target || ![source.name, target.name].includes(zs.padtecSlug(zs.padtecSite(selected.name) ?? "")))
        throw new Error("O alarme selecionado não pertence a nenhum dos equipamentos desta ligação");
    }
    if (data.id)
      d.prepare(
        "UPDATE links SET from_pop=?, to_pop=?, distance_km=?, zabbix_host=?, zabbix_item=?, monitor_kind=?, optical_down_value=? WHERE id=?",
      ).run(data.from_pop, data.to_pop, data.distance_km, data.zabbix_host, data.zabbix_item, data.monitor_kind, data.monitor_kind === "padtec_loss" ? data.optical_down_value : "", data.id);
    else
      d.prepare(
        "INSERT INTO links (from_pop, to_pop, distance_km, zabbix_host, zabbix_item, monitor_kind, optical_down_value) VALUES (?,?,?,?,?,?,?)",
      ).run(data.from_pop, data.to_pop, data.distance_km, data.zabbix_host, data.zabbix_item, data.monitor_kind, data.monitor_kind === "padtec_loss" ? data.optical_down_value : "");
    return { ok: true };
  });

const channelSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  primary_path: z.array(z.number().int()).min(2),
  secondary_path: z.array(z.number().int()).default([]),
});

export const saveChannel = createServerFn({ method: "POST" })
  .inputValidator(channelSchema)
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    const p = JSON.stringify(data.primary_path);
    const s = JSON.stringify(data.secondary_path);
    if (data.id)
      d.prepare("UPDATE channels SET name=?, primary_path=?, secondary_path=? WHERE id=?").run(
        data.name, p, s, data.id,
      );
    else
      d.prepare("INSERT INTO channels (name, primary_path, secondary_path) VALUES (?,?,?)").run(
        data.name, p, s,
      );
    return { ok: true };
  });

export const deleteItem = createServerFn({ method: "POST" })
  .inputValidator(z.object({ kind: z.enum(["pops", "links", "channels"]), id: z.number().int() }))
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    d.prepare(`DELETE FROM ${data.kind} WHERE id=?`).run(data.id);
    return { ok: true };
  });

export const getZabbixStatus = createServerFn({ method: "GET" }).handler(async () => {
  await (await auth()).requireViewer();
  const d = await db();
  const names = (d.prepare("SELECT name FROM pops").all() as { name: string }[]).map((p) => p.name);
  const z = await import("@/server/zabbix.server");
  const links = d.prepare("SELECT * FROM links ORDER BY id").all() as Link[];
  const status = await z.getStatus(names, links);
  const { parksStatus } = await import("./parks-status");
  return { ...status, byName: parksStatus(status.byName, names) };
});

export const getPadtecOpticalItems = createServerFn({ method: "GET" }).handler(async () => {
  await (await auth()).requireAdmin();
  const zs = await import("@/server/zabbix.server");
  return zs.listOpticalItems();
});

export const PENDING_NOTE = "Localização pendente — ajuste latitude/longitude";

export const importChapadaCoite = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/chapada-coite.server");
  return service.registerChapadaCoite(await db());
});

export const importZabbixHosts = createServerFn({ method: "POST" })
  .inputValidator(z.object({ prefix: z.string().max(50).default("sw-") }))
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    const zs = await import("@/server/zabbix.server");
    const hosts =
      data.prefix === zs.PADTEC_PREFIX
        ? (await zs.listPadtecSites()).map((x) => ({ host: x.host, city: x.site.toUpperCase(), lat: null, lng: null }))
        : (await zs.listHosts(data.prefix)).map((h) => ({ ...h, city: h.host.replace(/^[a-z]+-/i, "").replace(/[-_]+/g, " ").toUpperCase() }));
    const existing = new Set((d.prepare("SELECT name FROM pops").all() as { name: string }[]).map((p) => p.name));
    const ins = d.prepare("INSERT INTO pops (name, city, lat, lng, notes) VALUES (?,?,?,?,?)");
    let added = 0;
    for (const h of hosts) {
      if (existing.has(h.host)) continue;
      const city = h.city;
      const hasLoc = h.lat !== null && h.lng !== null;
      ins.run(h.host, city, hasLoc ? h.lat : -12.97, hasLoc ? h.lng : -38.51, hasLoc ? "" : PENDING_NOTE);
      added++;
    }
    return { found: hosts.length, added };
  });

export const reviewDwdmLinks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ kind: z.enum(["padtec", "eci"]) }))
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const service = await import("@/server/dwdm.server");
    return service.reviewDwdm(await db(), data.kind);
  });

export const importConfirmedEciRing = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/dwdm.server");
  return service.importEciRing(await db());
});

export const importConfirmedPadtecRings = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/dwdm.server");
  return service.importPadtecRings(await db());
});

export const applyConfirmedEciMonitoring = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/dwdm.server");
  return service.applyEciMonitoring(await db());
});

export const connectConfirmedIrece = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/dwdm.server");
  return service.connectIrece(await db());
});

export const importDwdmLinks = createServerFn({ method: "POST" })
  .inputValidator(z.object({ kind: z.enum(["padtec", "eci"]), choices: z.array(z.object({ key: z.string().min(1).max(500), to: z.string().min(1).max(80) })).min(1).max(5000), confirmed: z.literal(true) }))
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const service = await import("@/server/dwdm.server");
    return service.importReviewedDwdm(await db(), data.kind, data.choices);
  });

export const importMissingLinks = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/missing-links.server");
  return service.importMissingLinks(await db());
});

export const importParksSegments = createServerFn({ method: "POST" }).handler(async () => {
  await (await auth()).requireAdmin();
  const service = await import("@/server/parks.server");
  return service.importParks(await db());
});
