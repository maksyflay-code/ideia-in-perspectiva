import { describe, expect, it } from "vitest";
import { opticalStatus, opticalLossKey } from "@/lib/optical-status";
import { interfaceStatus, type InterfaceItem } from "@/lib/link-status";
import type { Link } from "@/lib/network.types";

const now = 1800000000000;
const link: Link = { id: 1, from_pop: 1, to_pop: 2, distance_km: 0, zabbix_host: "Padtec - Servidor", zabbix_item: "176366", monitor_kind: "padtec_loss", optical_down_value: "1" };
const item: InterfaceItem = { itemid: "176366", key_: "cardPart2702_alarmLossLine1.[1302]", lastvalue: "1", lastclock: String(now / 1000), status: "0", state: "0", hosts: [{ host: "Padtec - Servidor" }] };
describe("Padtec Loss explicitamente configurado", () => {
  it("não assume a polaridade sem confirmação", () => expect(opticalStatus(item, { ...link, optical_down_value: "" }, now).state).toBe("unknown"));
  it("marca perda quando o valor confirmado é 1", () => expect(opticalStatus(item, link, now).state).toBe("down"));
  it("marca ausência de alarme com 0 quando perda é 1", () => expect(opticalStatus({ ...item, lastvalue: "0" }, link, now).state).toBe("up"));
  it("respeita polaridade inversa explicitamente confirmada", () => expect(opticalStatus({ ...item, lastvalue: "0" }, { ...link, optical_down_value: "0" }, now).state).toBe("down"));
  it("aceita 1 sem alarme quando perda é 0", () => expect(opticalStatus(item, { ...link, optical_down_value: "0" }, now).state).toBe("up"));
  it("rejeita host diferente", () => expect(opticalStatus(item, { ...link, zabbix_host: "sw-paf" }, now).state).toBe("unknown"));
  it("rejeita item de outro host", () => expect(opticalStatus({ ...item, hosts: [{ host: "outro" }] }, link, now).state).toBe("unknown"));
  it("rejeita leitura com 301 segundos", () => expect(opticalStatus({ ...item, lastclock: String(now / 1000 - 301) }, link, now).state).toBe("unknown"));
  it("aceita leitura com 300 segundos", () => expect(opticalStatus({ ...item, lastclock: String(now / 1000 - 300) }, link, now).state).toBe("down"));
  it("rejeita leitura futura", () => expect(opticalStatus({ ...item, lastclock: String(now / 1000 + 1) }, link, now).state).toBe("unknown"));
  it("rejeita relógio inválido", () => expect(opticalStatus({ ...item, lastclock: "abc" }, link, now).state).toBe("unknown"));
  it("rejeita item desabilitado", () => expect(opticalStatus({ ...item, status: "1" }, link, now).state).toBe("unknown"));
  it("rejeita item sem suporte", () => expect(opticalStatus({ ...item, state: "1" }, link, now).state).toBe("unknown"));
  it("rejeita valor não binário", () => expect(opticalStatus({ ...item, lastvalue: "2" }, link, now).state).toBe("unknown"));
  it("não converte potência zero em queda", () => expect(opticalStatus({ ...item, key_: "cardPart2702_pinLine1.[1302]", lastvalue: "0" }, link, now).state).toBe("unknown"));
  it("não aceita Loss Sync como Loss da Line", () => expect(opticalLossKey.test("cardPart2702_alarmLossSyncLine1.[1302]")).toBe(false));
  it("aceita Line 2 com número de placa diferente", () => expect(opticalLossKey.test("cardPart2762_alarmLossLine2.[772]")).toBe(true));
  it("não altera a interpretação dos switches", () => expect(interfaceStatus(item, "Padtec - Servidor", now).state).toBe("unknown"));
});