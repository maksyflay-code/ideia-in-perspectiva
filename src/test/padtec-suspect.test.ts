import { describe, expect, it } from "vitest";
import { linkVisualState } from "@/lib/link-status";
import type { Link } from "@/lib/network.types";

const link: Link = { id: 1, from_pop: 1, to_pop: 2, distance_km: 100, zabbix_host: "", zabbix_item: "" };
const endpoints = { from: { name: "padtec-mossoro" }, to: { name: "padtec-santa-luzia" } };
const critical = { state: "down", problems: [{ name: "Alarme óptico", severity: 4 }] };
const status = { enabled: true, byName: { "padtec-mossoro": critical, "padtec-santa-luzia": critical } };

describe("Correlação suspeita Padtec sem substituir monitoramento", () => {
  it("marca Mossoró–Santa Luzia apenas como suspeita com ambas as pontas críticas", () => {
    expect(linkVisualState(link, status, endpoints)).toBe("suspect");
  });
  it("preserva falha confirmada em todos os 14 trechos monitorados", () => {
    for (let id = 1; id <= 14; id++) {
      expect(linkVisualState({ ...link, id, monitor_kind: "padtec_loss", zabbix_item: String(id) }, {
        ...status, byLink: { [String(id)]: { state: "down", message: "Loss confirmado" } },
      }, endpoints)).toBe("down");
    }
  });
  it.each(["up", "unknown"] as const)("preserva estado monitorado %s mesmo com alarmes nas pontas", (state) => {
    expect(linkVisualState({ ...link, zabbix_item: "99" }, { ...status, byLink: { "1": { state, message: "" } } }, endpoints)).toBe(state);
  });
  it("não presume queda com uma única ponta crítica", () => {
    expect(linkVisualState(link, { ...status, byName: { "padtec-mossoro": critical } }, endpoints)).toBe("unmonitored");
  });
  it("retira suspeita quando uma ponta recupera", () => {
    expect(linkVisualState(link, { ...status, byName: { ...status.byName, "padtec-santa-luzia": { state: "ok", problems: [] } } }, endpoints)).toBe("unmonitored");
  });
  it("não usa estados críticos sem alarmes ativos", () => {
    expect(linkVisualState(link, { ...status, byName: { "padtec-mossoro": { state: "down", problems: [] }, "padtec-santa-luzia": critical } }, endpoints)).toBe("unmonitored");
  });
  it("não mostra suspeita se a consulta falhar", () => {
    expect(linkVisualState(link, { ...status, error: "offline" }, endpoints)).toBe("unmonitored");
    expect(linkVisualState(link, { ...status, enabled: false }, endpoints)).toBe("unmonitored");
  });
  it("não altera switches ou ECI", () => {
    for (const name of ["sw-mossoro", "eci-mossoro"]) {
      expect(linkVisualState(link, { ...status, byName: { ...status.byName, [name]: critical } }, { ...endpoints, from: { name } })).toBe("unmonitored");
    }
  });
});