import { describe, expect, it } from "vitest";
import type { Db } from "../server/db.server";
import { registerChapadaCoite } from "../server/chapada-coite.server";
import { filterNetwork } from "../lib/map-layout";
import type { Network } from "../lib/network.types";

async function database() {
  const moduleName = "node:sqlite";
  const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE pops(id INTEGER PRIMARY KEY,name TEXT,city TEXT,lat REAL,lng REAL,notes TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT);");
  return sqlite;
}

describe("Cadastro de Chapada Coité", () => {
  it("persists the switch at the user's map pin, visible on the switch map", async () => {
    const sqlite = await database();
    expect(registerChapadaCoite(sqlite as unknown as Db)).toEqual({ added: 1, pending: 2 });
    const pops = sqlite.prepare("SELECT * FROM pops").all() as unknown as Network["pops"];
    expect(pops).toHaveLength(1);
    expect(pops[0]).toMatchObject({ name: "sw-chapada-coite", lat: -11.6725332, lng: -39.367641 });
    expect(filterNetwork({ pops, links: [], channels: [] }, "sw").pops).toHaveLength(1);
    sqlite.close();
  });
  it("creates no links to an unknown Juazeirinho endpoint or the Tely/TIM operator", async () => {
    const sqlite = await database();
    sqlite.exec("INSERT INTO pops VALUES (1,'sw-coite','Coité',-11,-39,''); INSERT INTO pops VALUES (2,'sw-juazeiro','Juazeiro',-9,-40,'');");
    registerChapadaCoite(sqlite as unknown as Db);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM links").get()).toMatchObject({ n: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pops").get()).toMatchObject({ n: 3 });
    sqlite.close();
  });
  it("does not duplicate or overwrite an existing switch on repetition", async () => {
    const sqlite = await database();
    registerChapadaCoite(sqlite as unknown as Db);
    sqlite.exec("UPDATE pops SET lat=-11.67,notes='Atualização manual';");
    expect(registerChapadaCoite(sqlite as unknown as Db).added).toBe(0);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pops").get()).toMatchObject({ n: 1 });
    expect(sqlite.prepare("SELECT lat,notes FROM pops").get()).toMatchObject({ lat: -11.67, notes: "Atualização manual" });
    sqlite.close();
  });
  it("rejects ambiguous existing switches without changing data", async () => {
    const sqlite = await database();
    sqlite.exec("INSERT INTO pops VALUES (1,'sw-chapada-coite','Coité',0,0,''); INSERT INTO pops VALUES (2,'sw-chapada-coite','Coité',1,1,'');");
    expect(() => registerChapadaCoite(sqlite as unknown as Db)).toThrow("duplicidade");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM pops").get()).toMatchObject({ n: 2 });
    sqlite.close();
  });
});