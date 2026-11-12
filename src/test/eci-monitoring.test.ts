import { describe, expect, it, vi } from "vitest";
import { ECI_OSC_SEGMENTS, planEciMonitoring } from "../lib/eci-monitoring";
import { interfaceStatus } from "../lib/link-status";
import type { Db } from "../server/db.server";

const items = ECI_OSC_SEGMENTS.map((s, n) => ({ itemid: s.item, key_: `ifOperStatus.[${n + 1}]`, name: `OSC: Interface ${s.port} - Operation status`, hosts: [{ host: s.host }] }));
vi.mock("../server/zabbix.server", () => ({ listDwdmItems: vi.fn() }));
import { listDwdmItems } from "../server/zabbix.server";
import { applyEciMonitoring, importEciRing, connectIrece } from "../server/dwdm.server";
const names = ["cafarnaum", "bonito", "tapiramuta", "mairi", "riachao", "fsa", "serrinha", "valente", "cg", "jacobina", "varzeanova"];
const pops = names.map((name, n) => ({ id: n + 1, name: `eci-${name}`, city: name }));
const links = names.map((_, n) => ({ id: n + 1, from_pop: n + 1, to_pop: (n + 1) % 11 + 1, zabbix_host: "", zabbix_item: "", monitor_kind: "interface" }));

describe("ECI OSC monitoring", () => {
  it("connects Irecê only to Cafarnaum with item 169620, preserves the ring and reversed existing monitoring", async () => {
    const moduleName = "node:sqlite";
    const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE pops(id INTEGER,name TEXT,city TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT)");
    for (const p of pops) sqlite.prepare("INSERT INTO pops VALUES (?,?,?)").run(p.id, p.name, p.city);
    sqlite.exec("INSERT INTO pops VALUES (12,'eci-irece','IRECE')");
    const d = sqlite as unknown as Db;
    importEciRing(d);
    const osc = { itemid: "169620", name: "OSC: Interface osc100-u1/0 - Operation status", key_: "ifOperStatus.[356]", hosts: [{ host: "eci-irece" }] };
    vi.mocked(listDwdmItems).mockResolvedValue([osc]);
    expect(await connectIrece(d)).toEqual({ added: 1, applied: 1, preserved: 0, unchanged: 0 });
    expect(sqlite.prepare("SELECT * FROM links WHERE from_pop=12").get()).toMatchObject({ to_pop: 1, zabbix_host: "eci-irece", zabbix_item: "169620" });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 12 });
    expect(sqlite.prepare("SELECT * FROM links WHERE from_pop=11 AND to_pop=1").get()).toBeDefined();
    expect(await connectIrece(d)).toEqual({ added: 0, applied: 0, preserved: 0, unchanged: 1 });
    sqlite.exec("UPDATE links SET from_pop=1,to_pop=12,zabbix_host='eci-cafarnaum',zabbix_item='169595',distance_km=50 WHERE from_pop=12");
    expect(await connectIrece(d)).toEqual({ added: 0, applied: 0, preserved: 1, unchanged: 0 });
    expect(sqlite.prepare("SELECT * FROM links WHERE to_pop=12").get()).toMatchObject({ zabbix_item: "169595", distance_km: 50 });
    vi.mocked(listDwdmItems).mockResolvedValue([{ ...osc, hosts: [{ host: "eci-fsa" }] }]);
    await expect(connectIrece(d)).rejects.toThrow("169620");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 12 });
    sqlite.close();
  });
  it("maps the eleven image-confirmed segments to the exported operational IDs", () => {
    const plan = planEciMonitoring(pops, links, items);
    expect(plan.updates.map((l) => [l.id, l.host, l.item])).toEqual([
      [1, "eci-cafarnaum", "99713"], [2, "eci-bonito", "99554"],
      [3, "eci-tapiramuta", "99545"], [4, "eci-mairi", "99525"],
      [5, "eci-riachao", "99516"], [6, "eci-serrinha", "120896"],
      [7, "eci-valente", "99478"], [8, "eci-valente", "180878"],
      [9, "eci-cg", "99486"], [10, "eci-jacobina", "99469"],
      [11, "eci-cafarnaum", "99714"],
    ]);
  });
  it("preserves another monitoring configuration and handles reversed links", () => {
    const result = planEciMonitoring(pops, links.map((l) => l.id === 1 ? { ...l, from_pop: 2, to_pop: 1, zabbix_host: "eci-bonito", zabbix_item: "99553" } : l), items);
    expect(result.preserved).toBe(1);
    expect(result.updates).toHaveLength(10);
    expect(result.updates.some((l) => l.id === 1)).toBe(false);
  });
  it("rejects wrong host, port, non-operational or absent live items before any write", () => {
    for (const edit of [ { hosts: [{ host: "eci-fsa" }] }, { name: "OSC: Interface osc100-u3/0 - Operation status" }, { key_: "apolloTrRxPower.[1]" } ]) {
      expect(() => planEciMonitoring(pops, links, items.map((i, n) => n === 0 ? { ...i, ...edit } : i))).toThrow("99713");
    }
    expect(() => planEciMonitoring(pops, links, [])).toThrow("99713");
  });
  it("keeps stale OSC readings unknown and detects down as 2, not optical power", () => {
    const item = { ...items[0], itemid: "99713", key_: "ifOperStatus.[21]", hosts: [{ host: "eci-cafarnaum" }], lastvalue: "2", lastclock: "1000", status: "0", state: "0" };
    expect(interfaceStatus(item, "eci-cafarnaum", 1000000).state).toBe("down");
    expect(interfaceStatus({ ...item, lastvalue: "1" }, "eci-cafarnaum", 1000000).state).toBe("up");
    expect(interfaceStatus(item, "eci-cafarnaum", 1301000).state).toBe("unknown");
  });
  it("writes and reads all eleven existing links, repeats safely and rolls back invalid items", async () => {
    const moduleName = "node:sqlite";
    const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE pops(id INTEGER,name TEXT,city TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT)");
    for (const p of pops) sqlite.prepare("INSERT INTO pops VALUES (?,?,?)").run(p.id, p.name, p.city);
    const d = sqlite as unknown as Db;
    importEciRing(d);
    vi.mocked(listDwdmItems).mockResolvedValue(items);
    expect(await applyEciMonitoring(d)).toEqual({ applied: 11, unchanged: 0, preserved: 0, missing: 0 });
    expect(sqlite.prepare("SELECT zabbix_host,zabbix_item FROM links WHERE from_pop=7 AND to_pop=8").get()).toMatchObject({ zabbix_host: "eci-valente", zabbix_item: "99478" });
    expect(await applyEciMonitoring(d)).toEqual({ applied: 0, unchanged: 11, preserved: 0, missing: 0 });
    sqlite.exec("UPDATE links SET zabbix_host='', zabbix_item=''");
    vi.mocked(listDwdmItems).mockResolvedValue(items.slice(0, 10));
    await expect(applyEciMonitoring(d)).rejects.toThrow("99714");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links WHERE zabbix_item<>''").get()).toMatchObject({ n: 0 });
    sqlite.close();
  });
});