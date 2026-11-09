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
  return { user: await a.currentAdmin() };
});

export const login = createServerFn({ method: "POST" })
  .inputValidator(z.object({ user: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const a = await auth();
    if (!a.checkCredentials(data.user, data.password)) return { ok: false as const };
    await a.startSession(data.user);
    return { ok: true as const };
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
  })
  .refine((v) => v.from_pop !== v.to_pop, { message: "Origem e destino devem ser diferentes" });

export const saveLink = createServerFn({ method: "POST" })
  .inputValidator(linkSchema)
  .handler(async ({ data }) => {
    await (await auth()).requireAdmin();
    const d = await db();
    if (data.id)
      d.prepare(
        "UPDATE links SET from_pop=?, to_pop=?, distance_km=?, zabbix_host=?, zabbix_item=? WHERE id=?",
      ).run(data.from_pop, data.to_pop, data.distance_km, data.zabbix_host, data.zabbix_item, data.id);
    else
      d.prepare(
        "INSERT INTO links (from_pop, to_pop, distance_km, zabbix_host, zabbix_item) VALUES (?,?,?,?,?)",
      ).run(data.from_pop, data.to_pop, data.distance_km, data.zabbix_host, data.zabbix_item);
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
