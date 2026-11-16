import { describe, expect, it } from "vitest";
import { filterPops, triageAlarm } from "@/lib/alarm-triage";
import type { Network } from "@/lib/network.types";

const network: Network = {
  pops: [
    { id: 1, name: "sw-serrinha", city: "Serrinha", lat: -11.4, lng: -38.98, notes: "" },
    { id: 2, name: "sw-juazeiro", city: "Juazeiro", lat: -9.41, lng: -40.0, notes: "" },
    { id: 3, name: "sw-tucano", city: "Tucano", lat: -10.96, lng: -38.78, notes: "" },
    { id: 4, name: "sw-euclides", city: "Euclides da Cunha", lat: -10.35, lng: -39.01, notes: "" },
    { id: 5, name: "sw-irara", city: "Irára", lat: -12.1, lng: -38.76, notes: "" },
    { id: 6, name: "padtec-mossoro", city: "Mossoró", lat: -5.18, lng: -37.34, notes: "" },
    { id: 7, name: "padtec-santa-luzia", city: "Santa Luzia", lat: -5.12, lng: -37.25, notes: "" },
  ],
  links: [
    { id: 1, from_pop: 1, to_pop: 2, distance_km: 60, zabbix_host: "sw-serrinha", zabbix_item: "123" },
    { id: 2, from_pop: 2, to_pop: 3, distance_km: 40, zabbix_host: "", zabbix_item: "" },
    { id: 3, from_pop: 1, to_pop: 4, distance_km: 90, zabbix_host: "sw-serrinha", zabbix_item: "456" },
    {
      id: 4,
      from_pop: 6,
      to_pop: 7,
      distance_km: 120,
      zabbix_host: "Padtec - Servidor",
      zabbix_item: "176366",
      monitor_kind: "padtec_loss",
    },
  ],
  channels: [],
};

const run = (text: string, selected: string[] = []) => triageAlarm({ text, selected, network });

describe("Consultor local de alarme", () => {
  it("aponta a ligação direta quando o texto cita as duas pontas", () => {
    const r = run("Padtec - Servidor: Line 1 loss of signal em Mossoró e Santa Luzia");
    expect(r.devices.map((d) => d.name)).toEqual(["padtec-mossoro", "padtec-santa-luzia"]);
    expect(r.devices.every((d) => d.via === "texto")).toBe(true);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.linkId).toBe(4);
    expect(r.candidates[0]!.confidence).toBe("alta");
    expect(r.candidates[0]!.monitor).toBe("Alarme óptico da Line (Padtec)");
    expect(r.signals).toContain("perda de sinal óptico");
    expect(r.note).toBe("");
  });

  it("reconhece nomes acentuados e em maiúsculas", () => {
    expect(run("ALERTA MOSSORÓ").devices.map((d) => d.name)).toEqual(["padtec-mossoro"]);
  });

  it("não confirma trecho com apenas uma ponta citada", () => {
    const r = run("Line 1 loss of signal em Mossoró");
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.confidence).toBe("baixa");
    expect(r.candidates[0]!.monitored).toBe(true);
  });

  it("lista os trechos que saem do único equipamento identificado", () => {
    const r = run("sw-serrinha: Ethernet1/1 ifOperStatus down");
    expect(r.devices).toEqual([{ name: "sw-serrinha", via: "texto" }]);
    expect(r.candidates.map((c) => c.linkId)).toEqual([1, 3]);
    expect(r.candidates.every((c) => c.confidence === "baixa")).toBe(true);
    expect(r.signals).toContain("porta de interface caída");
  });

  it("sugere o caminho cadastrado quando não há ligação direta", () => {
    const r = run("", ["sw-serrinha", "sw-tucano"]);
    expect(r.candidates.map((c) => c.linkId)).toEqual([1, 2]);
    expect(r.candidates.every((c) => c.confidence === "media")).toBe(true);
    expect(r.candidates[0]!.reasons[0]).toContain("sw-serrinha → sw-juazeiro → sw-tucano");
  });

  it("avisa qual trecho do caminho não tem monitoramento", () => {
    const r = run("", ["sw-serrinha", "sw-tucano"]);
    const unmonitored = r.candidates.find((c) => c.linkId === 2)!;
    expect(unmonitored.monitored).toBe(false);
    expect(unmonitored.monitor).toBe("Sem monitoramento");
    expect(r.candidates.find((c) => c.linkId === 1)!.monitor).toBe("Porta monitorada no Zabbix");
  });

  it("avisa quando não existe caminho cadastrado entre os equipamentos", () => {
    const r = run("", ["sw-serrinha", "sw-irara"]);
    expect(r.note).toContain("Não há caminho cadastrado entre sw-serrinha e sw-irara");
    expect(r.candidates.map((c) => c.linkId)).toEqual([1, 3]);
    expect(r.candidates.every((c) => c.confidence === "baixa")).toBe(true);
  });

  it("não sugere nada sem equipamento reconhecido", () => {
    const r = run("linha 1 com problema");
    expect(r.devices).toEqual([]);
    expect(r.candidates).toEqual([]);
    expect(r.note).toContain("Nenhum equipamento do mapa foi reconhecido");
  });

  it("não duplica equipamento já selecionado", () => {
    const r = run("Serrinha caiu", ["sw-serrinha"]);
    expect(r.devices).toEqual([{ name: "sw-serrinha", via: "selecao" }]);
  });

  it("filtra POPs pela escrita parcial", () => {
    expect(filterPops("santa", network.pops).map((p) => p.name)).toEqual(["padtec-santa-luzia"]);
    expect(filterPops("", network.pops)).toEqual([]);
  });
});
