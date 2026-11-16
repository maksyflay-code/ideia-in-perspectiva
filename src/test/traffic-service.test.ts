import { describe, it, expect, vi } from "vitest";
import type { Db } from "@/server/db.server";
const fixture = vi.hoisted(() => {
  const now = Math.floor(Date.now() / 1000);
  return [{ itemid: "1", hostid: "100", name: "Interface lag-7 - IX: Bits received", key_: "net.if.in[ifHCInOctets.7]", units: "bps", lastvalue: "10000000000", lastclock: String(now), status: "0", state: "0", value_type: "3" }, { itemid: "2", hostid: "100", name: "Interface lag-7 - IX: Bits sent", key_: "net.if.out[ifHCOutOctets.7]", units: "bps", lastvalue: "2000000000", lastclock: String(now), status: "0", state: "0", value_type: "3" }];
});
vi.mock("@/server/zabbix.server", () => ({ queryZabbix: vi.fn(async (method: string) => method === "host.get" ? [{ hostid: "100", host: "sw-test" }] : method === "item.get" ? fixture : fixture.map(i => ({ itemid: i.itemid, clock: i.lastclock, value: i.lastvalue }))) }));
import { saveTraffic, selectedTraffic, readTraffic } from "@/server/traffic.server";
async function database() {
  const moduleName = "node:sqlite";
  const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import("node:sqlite");
  return new DatabaseSync(":memory:");
}
describe("Portas confirmadas em SQLite", () => {
  it("salva, relê e consulta apenas a porta confirmada", async () => {
    const db = await database();
    await saveTraffic(db as Db, [{ portId: "100:7", group: "external" }]);
    expect(selectedTraffic(db as Db)).toEqual([{ portId: "100:7", group: "external" }]);
    const result = await readTraffic(db as Db);
    expect(result.external.download).toBe(10); expect(result.external.upload).toBe(2);
    expect(result.clients.download).toBeNull(); db.close();
  });
  it("recusa porta inexistente e preserva a seleção anterior", async () => {
    const db = await database();
    await saveTraffic(db as Db, [{ portId: "100:7", group: "clients" }]);
    await expect(saveTraffic(db as Db, [{ portId: "100:8", group: "external" }])).rejects.toThrow("não existe");
    expect(selectedTraffic(db as Db)).toEqual([{ portId: "100:7", group: "clients" }]); db.close();
  });
  it("recusa mesma porta em dois grupos", async () => {
    const db = await database();
    await expect(saveTraffic(db as Db, [{ portId: "100:7", group: "external" }, { portId: "100:7", group: "clients" }])).rejects.toThrow("um grupo"); db.close();
  });
});