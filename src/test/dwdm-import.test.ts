import { describe, expect, it, vi } from "vitest";
import type { Db } from "../server/db.server";

vi.mock("../server/zabbix.server", () => ({
  listDwdmItems: vi.fn(async () => [{ itemid: "100168", name: "ODU: Interface otuc2-u4/0 - FSA - Operation status", key_: "odu.ifOperStatus.[351]", hosts: [{ host: "eci-cafarnaum" }] }]),
}));
import { importReviewedDwdm, importEciRing } from "../server/dwdm.server";
import { filterNetwork } from "../lib/map-layout";
import type { Network } from "../lib/network.types";

describe("SQLite reviewed DWDM import", () => {
  it("persists all eleven ring segments for the DWDM map and preserves existing monitoring on repeated import", async () => {
    const moduleName = "node:sqlite";
    const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE pops(id INTEGER,name TEXT,city TEXT,lat REAL,lng REAL,notes TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT);");
    const names = ["cafarnaum", "bonito", "tapiramuta", "mairi", "riachao", "fsa", "serrinha", "valente", "cg", "jacobina", "varzea-nova"];
    for (const [index, name] of names.entries()) sqlite.prepare("INSERT INTO pops VALUES (?,?,?,-12,-39,'')").run(index + 1, `eci-${name}`, name);
    sqlite.exec("INSERT INTO links VALUES (1,2,1,20,'eci-bonito','123','interface','')");
    const d = sqlite as unknown as Db;
    expect(importEciRing(d)).toEqual({ added: 10, existed: 1, unmonitored: 10 });
    const net = { pops: sqlite.prepare("SELECT * FROM pops").all(), links: sqlite.prepare("SELECT * FROM links").all(), channels: [] } as unknown as Network;
    expect(filterNetwork(net, "dwdm").links).toHaveLength(11);
    expect(net.pops).toHaveLength(11);
    expect({ ...sqlite.prepare("SELECT * FROM links WHERE id=1").get() }).toMatchObject({ distance_km: 20, zabbix_host: "eci-bonito", zabbix_item: "123" });
    expect(importEciRing(d)).toEqual({ added: 0, existed: 11, unmonitored: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 11 });
    sqlite.exec("DELETE FROM pops WHERE id=9; DELETE FROM links WHERE id>1;");
    expect(() => importEciRing(d)).toThrow("Capim Grosso");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 1 });
    sqlite.close();
  });
  it("writes the selected monitored link, reads it back, and skips a repeated import", async () => {
    const moduleName = "node:sqlite";
    const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE pops(id INTEGER,name TEXT,city TEXT); CREATE TABLE links(from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT); INSERT INTO pops VALUES (1,'eci-cafarnaum','CAFARNAUM'),(2,'eci-fsa','FSA');");
    const d = sqlite as unknown as Db;
    const choices = [{ key: "eci-cafarnaum:odu.ifOperStatus.[351]", to: "eci-fsa" }];
    expect(await importReviewedDwdm(d, "eci", choices)).toEqual({ added: 1, existed: 0, unmonitored: 0 });
    expect({ ...sqlite.prepare("SELECT * FROM links").get() }).toEqual({ from_pop: 1, to_pop: 2, distance_km: 0, zabbix_host: "eci-cafarnaum", zabbix_item: "100168", monitor_kind: "interface", optical_down_value: "" });
    expect(await importReviewedDwdm(d, "eci", choices)).toEqual({ added: 0, existed: 1, unmonitored: 0 });
    sqlite.close();
  });
});