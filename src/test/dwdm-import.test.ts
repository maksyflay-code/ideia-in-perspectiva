import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { Db } from "../server/db.server";

vi.mock("../server/zabbix.server", () => ({
  listDwdmItems: vi.fn(async () => [{ itemid: "100168", name: "ODU: Interface otuc2-u4/0 - FSA - Operation status", key_: "odu.ifOperStatus.[351]", hosts: [{ host: "eci-cafarnaum" }] }]),
}));
import { importReviewedDwdm } from "../server/dwdm.server";

describe("SQLite reviewed DWDM import", () => {
  it("writes the selected monitored link, reads it back, and skips a repeated import", async () => {
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