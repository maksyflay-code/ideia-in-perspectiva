import { describe, it, expect } from "vitest";
import { rate, trafficGroup, trafficPorts, type TrafficItem } from "@/lib/traffic";
const now = 1794838200;
const rx: TrafficItem = { itemid: "1", hostid: "100", name: "Interface lag-7 - LAG-IX.BA: Bits received", key_: "net.if.in[ifHCInOctets.7]", units: "bps", lastvalue: "10000000000", lastclock: String(now), status: "0", state: "0", value_type: "3" };
const tx: TrafficItem = { ...rx, itemid: "2", key_: "net.if.out[ifHCOutOctets.7]", lastvalue: "2000000000" };
const hosts = [{ hostid: "100", host: "sw-telxius1" }];
const ports = trafficPorts([rx, tx], hosts);
describe("Tráfego do ecossistema", () => {
  it("converte bits por segundo para Gbps decimais", () => expect(rate(rx, now)).toBe(10));
  it("download externo é RX e upload externo é TX", () => {
    const value = trafficGroup(ports, [{ portId: "100:7", group: "external" }], "external", now);
    expect(value.download).toBe(10); expect(value.upload).toBe(2);
  });
  it("download do cliente é TX e upload do cliente é RX", () => {
    const value = trafficGroup(ports, [{ portId: "100:7", group: "clients" }], "clients", now);
    expect(value.download).toBe(2); expect(value.upload).toBe(10);
  });
  it("não soma portas não selecionadas", () => expect(trafficGroup(ports, [], "external", now).download).toBeNull());
  it("mantém internet e clientes separados", () => expect(trafficGroup(ports, [{ portId: "100:7", group: "clients" }], "external", now).download).toBeNull());
  it("não conta a mesma porta duas vezes", () => expect(trafficGroup(ports, [{ portId: "100:7", group: "external" }, { portId: "100:7", group: "external" }], "external", now).download).toBe(10));
  it("não mostra um total parcial quando falta uma porta", () => {
    const result = trafficGroup(ports, [{ portId: "100:7", group: "external" }, { portId: "100:8", group: "external" }], "external", now);
    expect(result.download).toBeNull(); expect(result.missing).toBe(1);
  });
  it("ignora leituras antigas acima de 300 segundos", () => expect(rate({ ...rx, lastclock: String(now - 301) }, now)).toBeNull());
  it("ignora contadores brutos, desativados e sem suporte", () => {
    expect(rate({ ...rx, units: "B" }, now)).toBeNull();
    expect(rate({ ...rx, status: "1" }, now)).toBeNull();
    expect(rate({ ...rx, state: "1" }, now)).toBeNull();
  });
  it("gráfico usa amostras reais completas, deixando lacunas sem inventar valores", () => {
    const result = trafficGroup(ports, [{ portId: "100:7", group: "external" }], "external", now, [{ itemid: "1", clock: String(now - 60), value: "5000000000" }, { itemid: "2", clock: String(now - 60), value: "1000000000" }]);
    expect(result.series.find(p => p.clock === now - 60)?.download).toBe(5);
    expect(result.series.find(p => p.clock === now)?.download).toBeNull();
  });
  it("descobre pares RX/TX do switch sem inferir categoria pelo nome", () => { expect(ports).toHaveLength(1); expect(ports[0]?.label).toBe("lag-7 - LAG-IX.BA"); });
});