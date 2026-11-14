import { afterEach, describe, expect, it, vi } from "vitest";
import { opticalLineKeys } from "@/lib/optical-status";
import type { Link } from "@/lib/network.types";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
describe("Live Zabbix Padtec alarm lookup", () => {
  async function run(failOptical = false) {
    vi.stubEnv("ZABBIX_URL", "https://zabbix.test");
    vi.stubEnv("ZABBIX_USER", "test-user");
    vi.stubEnv("ZABBIX_PASSWORD", "test-password");
    const clock = String(Math.floor(Date.now() / 1000));
    const padtec: Link = { id: 1, from_pop: 1, to_pop: 2, distance_km: 0, monitor_kind: "padtec_loss", optical_down_value: "1", zabbix_host: "Padtec - Servidor", zabbix_item: "176366" };
    const sw: Link = { id: 2, from_pop: 3, to_pop: 4, distance_km: 0, zabbix_host: "sw-a", zabbix_item: "9" };
    const base = { status: "0", state: "0", lastclock: clock, lastvalue: "0", hosts: [{ host: "Padtec - Servidor" }] };
    const lineItems = ["cardPart2702_alarmLossLine1.[1302]", "cardPart2702_alarmLossLine1.[1312]"].flatMap((k) => opticalLineKeys(k).map((key_, n) => ({ ...base, key_, itemid: key_, lastvalue: k.includes("1312") && n === 1 ? "1" : "0", valuemap: { mappings: [{ value: "1", newvalue: "active alarm" }, { value: "0", newvalue: "no alarm" }] } })));
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => {
      const { method, params } = JSON.parse(String(init.body));
      let result: unknown = [];
      if (method === "user.login") result = "test-token";
      if (method === "item.get" && params.itemids) result = [{ ...base, itemid: "176366", key_: "cardPart2702_alarmLossLine1.[1302]" }, { ...base, itemid: "9", key_: "net.if.status[ifOperStatus.1]", hosts: [{ host: "sw-a" }], lastvalue: "1" }];
      if (method === "item.get" && params.filter) {
        if (failOptical) throw new Error("unavailable");
        expect(params.filter.key_).toHaveLength(6);
        result = lineItems;
      }
      return new Response(JSON.stringify({ result }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getStatus } = await import("@/server/zabbix.server");
    return getStatus([], [padtec, sw]);
  }
  it("marks the link down from Sync at Paulo Afonso even when Santa Luzia Loss is normal", async () => {
    const status = await run();
    expect(status.byLink?.["1"]).toMatchObject({ state: "down", message: "Perda de sincronismo na Line" });
    expect(status.byLink?.["2"]?.state).toBe("up");
  });
  it("keeps switches active if the Padtec sibling lookup fails", async () => {
    const status = await run(true);
    expect(status.byLink?.["1"]?.state).toBe("unknown");
    expect(status.byLink?.["2"]?.state).toBe("up");
  });
});