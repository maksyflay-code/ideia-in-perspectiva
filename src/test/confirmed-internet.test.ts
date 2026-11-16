import { describe, it, expect } from "vitest";
import { CONFIRMED_INTERNET, planConfirmedInternet } from "@/lib/confirmed-internet";
import type { TrafficPort } from "@/lib/traffic";
const ports: TrafficPort[] = CONFIRMED_INTERNET.map((c, n) => {
  const base = { hostid: String(n + 100), units: "bps", lastvalue: "0", lastclock: "1794838200", status: "0", state: "0", value_type: "3" };
  return { id: `${n + 100}:${c.index}`, host: c.host, label: c.label, rx: { ...base, itemid: c.rx, name: c.label, key_: `net.if.in[ifHCInOctets.${c.index}]` }, tx: { ...base, itemid: c.tx, name: c.label, key_: `net.if.out[ifHCOutOctets.${c.index}]` } };
});
describe("Internet/IX confirmado", () => {
  it("aplica exatamente os sete agregados confirmados sem portas físicas", () => {
    const result = planConfirmedInternet(ports, []);
    expect(result).toHaveLength(7);
    expect(result.map(s => s.portId)).toEqual(ports.map(p => p.id));
    expect(result.every(s => s.group === "external")).toBe(true);
    expect(CONFIRMED_INTERNET.map(c => c.rx)).toEqual(["86965", "86966", "86969", "92823", "82898", "76992", "80006"]);
  });
  it("preserva clientes e substitui apenas a seleção externa anterior", () => {
    const result = planConfirmedInternet(ports, [{ portId: "200:9", group: "clients" }, { portId: "300:8", group: "external" }]);
    expect(result).toContainEqual({ portId: "200:9", group: "clients" });
    expect(result.some(s => s.portId === "300:8")).toBe(false);
  });
  it("recusa lista incompleta em vez de aplicar parcialmente", () => expect(() => planConfirmedInternet(ports.slice(1), [])).toThrow("Nada foi aplicado"));
  it("recusa host alterado mesmo com mesmo item", () => expect(() => planConfirmedInternet(ports.map((p, i) => i === 0 ? { ...p, host: "sw-outro" } : p), [])).toThrow("Nada foi aplicado"));
  it("não reclassifica silenciosamente porta de cliente", () => expect(() => planConfirmedInternet(ports, [{ portId: ports[0]?.id ?? "", group: "clients" }])).toThrow("Clientes"));
});