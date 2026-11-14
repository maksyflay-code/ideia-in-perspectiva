import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db.server";
import { SANTA_LUZIA_PAF_ALARMS } from "@/lib/optical-status";
vi.mock("@/server/zabbix.server", () => ({
  listDwdmItems: vi.fn(),
  listOpticalItems: vi.fn(async () => SANTA_LUZIA_PAF_ALARMS.map((a) => ({ itemid: a.item, key_: a.key, hosts: [{ host: "Padtec - Servidor" }] }))),
}));
import { connectSantaLuziaPaf } from "@/server/dwdm.server";
import { listOpticalItems } from "@/server/zabbix.server";

async function database() {
  const moduleName = "node:sqlite";
  const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
  const d = new DatabaseSync(":memory:");
  d.exec("CREATE TABLE pops(id INTEGER,name TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT); INSERT INTO pops VALUES(1,'padtec-santa-luzia'),(2,'padtec-paulo-afonso');");
  return d;
}
describe("Confirmed Santa Luzia–Paulo Afonso SQLite action", () => {
  it("persists the confirmed Line and polarity and does not duplicate on repetition", async () => {
    const d = await database();
    expect(await connectSantaLuziaPaf(d as unknown as Db)).toEqual({ added: 1, applied: 1, preserved: 0 });
    expect(d.prepare("SELECT * FROM links").get()).toMatchObject({ from_pop: 1, to_pop: 2, zabbix_item: "176366", zabbix_host: "Padtec - Servidor", monitor_kind: "padtec_loss", optical_down_value: "1" });
    expect(await connectSantaLuziaPaf(d as unknown as Db)).toEqual({ added: 0, applied: 0, preserved: 1 });
    expect(d.prepare("SELECT count(*) n FROM links").get()).toMatchObject({ n: 1 });
    d.close();
  });
  it("fills existing unmonitored reverse segment and retains distance", async () => {
    const d = await database();
    d.exec("INSERT INTO links VALUES(4,2,1,200,'','','interface','')");
    expect(await connectSantaLuziaPaf(d as unknown as Db)).toEqual({ added: 0, applied: 1, preserved: 0 });
    expect(d.prepare("SELECT * FROM links").get()).toMatchObject({ id: 4, distance_km: 200, zabbix_item: "176366" });
    d.close();
  });
  it("never replaces existing monitoring", async () => {
    const d = await database();
    d.exec("INSERT INTO links VALUES(4,1,2,200,'custom','999','interface','')");
    expect(await connectSantaLuziaPaf(d as unknown as Db)).toMatchObject({ preserved: 1, applied: 0 });
    expect(d.prepare("SELECT * FROM links").get()).toMatchObject({ zabbix_item: "999", zabbix_host: "custom" });
    d.close();
  });
  it("rejects missing endpoint without creating a link", async () => {
    const d = await database(); d.exec("DELETE FROM pops WHERE id=2");
    await expect(connectSantaLuziaPaf(d as unknown as Db)).rejects.toThrow("exatamente um");
    expect(d.prepare("SELECT count(*) n FROM links").get()).toMatchObject({ n: 0 }); d.close();
  });
  it("requires the second live endpoint alarm", async () => {
    const d = await database();
    vi.mocked(listOpticalItems).mockResolvedValueOnce([]);
    await expect(connectSantaLuziaPaf(d as unknown as Db)).rejects.toThrow("176366");
    expect(d.prepare("SELECT count(*) n FROM links").get()).toMatchObject({ n: 0 }); d.close();
  });
});