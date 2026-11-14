import { describe, expect, it } from "vitest";
import { opticalLineStatus, opticalLineKeys, SANTA_LUZIA_PAF_ALARMS } from "@/lib/optical-status";
import type { Link } from "@/lib/network.types";

const now = 1800000000000;
const key = "cardPart2702_alarmLossLine1.[1302]";
const link: Link = { id: 1, from_pop: 1, to_pop: 2, distance_km: 0, monitor_kind: "padtec_loss", zabbix_host: "Padtec - Servidor", zabbix_item: "176366", optical_down_value: "1" };
const mappings = [{ value: "1", newvalue: "active alarm" }, { value: "0", newvalue: "no alarm" }];
const items = opticalLineKeys(key).map((key_, index) => ({ itemid: String(index), key_, lastvalue: "0", lastclock: String(now / 1000), status: "0", state: "0", hosts: [{ host: "Padtec - Servidor" }], valuemap: { mappings } }));
describe("Complete confirmed Padtec Line alarms", () => {
  it("marks fresh Loss 1 as down", () => expect(opticalLineStatus(items.map((i, n) => n === 0 ? { ...i, lastvalue: "1" } : i), key, link, now).state).toBe("down"));
  it("marks fresh Sync 1 as down", () => expect(opticalLineStatus(items.map((i, n) => n === 1 ? { ...i, lastvalue: "1" } : i), key, link, now).state).toBe("down"));
  it("marks fresh OTU LOF 1 as down", () => expect(opticalLineStatus(items.map((i, n) => n === 2 ? { ...i, lastvalue: "1" } : i), key, link, now).state).toBe("down"));
  it("requires all three normal fresh alarms to show up", () => expect(opticalLineStatus(items, key, link, now).state).toBe("up"));
  it("missing Sync is unknown", () => expect(opticalLineStatus(items.filter((_, n) => n !== 1), key, link, now).state).toBe("unknown"));
  it("never uses a different Line or card", () => expect(opticalLineStatus([...items, ...items.map((i) => ({ ...i, key_: i.key_.replace("[1302]", "[1312]"), lastvalue: "1" }))], key, link, now).state).toBe("up"));
  it("discards a 301-second-old Sync alarm", () => expect(opticalLineStatus(items.map((i, n) => n === 1 ? { ...i, lastvalue: "1", lastclock: String(now / 1000 - 301) } : i), key, link, now).state).toBe("unknown"));
  it("a confirmed fresh alarm wins even if another reading is missing", () => expect(opticalLineStatus(items.filter((_, n) => n !== 1).map((i) => ({ ...i, lastvalue: "1" })), key, link, now).state).toBe("down"));
  it("does not infer sibling polarity without a value map", () => expect(opticalLineStatus(items.map(({ valuemap, ...i }) => i), key, link, now).state).toBe("unknown"));
  it("does not use another host's sibling", () => expect(opticalLineStatus(items.map((i, n) => n === 1 ? { ...i, hosts: [{ host: "other" }] } : i), key, link, now).state).toBe("unknown"));
  it("confirms both endpoint IDs and exact Lines", () => expect(SANTA_LUZIA_PAF_ALARMS).toEqual([{ item: "176366", key }, { item: "176790", key: "cardPart2702_alarmLossLine1.[1312]" }]));
});