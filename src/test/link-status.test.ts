import { describe, expect, it } from "vitest";
import { interfaceStatus, linkVisualState, type InterfaceItem } from "@/lib/link-status";

const now = 1800000000000;
const item: InterfaceItem = { itemid: "123", key_: "net.if.status[ifOperStatus.12]", lastvalue: "1", lastclock: String(now / 1000), status: "0", state: "0", hosts: [{ host: "sw-a" }] };
const link = { id: 7, from_pop: 1, to_pop: 2, distance_km: 12, zabbix_host: "sw-a", zabbix_item: "123" };
describe("Estado real da ligação", () => {
  it("marca operacional 1 como ativa", () => expect(interfaceStatus(item, "sw-a", now).state).toBe("up"));
  it("marca operacional 2 como caída", () => expect(interfaceStatus({ ...item, lastvalue: "2" }, "sw-a", now).state).toBe("down"));
  it("não considera tráfego zero uma queda", () => expect(interfaceStatus({ ...item, key_: "net.if.in[ifHCInOctets.12]", lastvalue: "0" }, "sw-a", now).state).toBe("unknown"));
  it("não usa a leitura de outro host", () => expect(interfaceStatus(item, "sw-b", now).state).toBe("unknown"));
  it("descarta leituras com mais de 300 segundos", () => expect(interfaceStatus({ ...item, lastclock: String(now / 1000 - 301) }, "sw-a", now).state).toBe("unknown"));
  it("aceita leitura de 300 segundos", () => expect(interfaceStatus({ ...item, lastclock: String(now / 1000 - 300) }, "sw-a", now).state).toBe("up"));
  it("descarta item desabilitado", () => expect(interfaceStatus({ ...item, status: "1" }, "sw-a", now).state).toBe("unknown"));
  it("descarta item sem suporte", () => expect(interfaceStatus({ ...item, state: "1" }, "sw-a", now).state).toBe("unknown"));
  it("não trata outros estados como ativos", () => expect(interfaceStatus({ ...item, lastvalue: "7" }, "sw-a", now).state).toBe("unknown"));
  it("não transforma alerta do switch em queda do enlace", () => expect(linkVisualState(link, { enabled: true, byLink: {} })).toBe("unknown"));
  it("não mostra queda com Zabbix indisponível", () => expect(linkVisualState(link, { enabled: true, error: "offline", byLink: { "7": { state: "down", message: "" } } })).toBe("unknown"));
  it("mantém ligação não configurada como sem monitoramento", () => expect(linkVisualState({ ...link, zabbix_item: "" })).toBe("unmonitored"));
});