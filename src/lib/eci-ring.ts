import type { DiscoveryPop, PlannedDwdmLink } from "./dwdm-discovery";

// Physical segments identified by the OSC dashboard titles supplied by the admin.
export const ECI_RING = [
  { city: "Cafarnaum", aliases: ["cafarnaum"] },
  { city: "Bonito", aliases: ["bonito"] },
  { city: "Tapiramutá", aliases: ["tapiramuta"] },
  { city: "Mairi", aliases: ["mairi"] },
  { city: "Riachão", aliases: ["riachao"] },
  { city: "Feira de Santana", aliases: ["feiradesantana", "fsa"] },
  { city: "Serrinha", aliases: ["serrinha"] },
  { city: "Valente", aliases: ["valente"] },
  { city: "Capim Grosso", aliases: ["capimgrosso", "cg"] },
  { city: "Jacobina", aliases: ["jacobina"] },
  { city: "Várzea Nova", aliases: ["varzeanova"] },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function planEciRing(pops: DiscoveryPop[], existing: { from_pop: number; to_pop: number }[]) {
  const nodes = ECI_RING.map((site) => {
    const matches = pops.filter((p) => p.name.startsWith("eci-") &&
      [normalize(p.name.slice(4)), normalize(p.city)].some((n) => site.aliases.includes(n)));
    if (matches.length !== 1) throw new Error(`${site.city}: ${matches.length ? "mais de um ECI corresponde; ajuste os cadastros" : "ECI não cadastrado; importe ou cadastre o equipamento primeiro"}`);
    const match = matches[0];
    if (!match) throw new Error("ECI não encontrado");
    return match;
  });
  if (new Set(nodes.map((p) => p.id)).size !== 11) throw new Error("O anel exige 11 equipamentos ECI distintos");
  const pair = (a: number, b: number) => [a, b].sort((x, y) => x - y).join(":");
  const pairs = new Set(existing.map((l) => pair(l.from_pop, l.to_pop)));
  const planned: PlannedDwdmLink[] = [];
  let existed = 0;
  nodes.forEach((from, index) => {
    const to = nodes[(index + 1) % nodes.length];
    if (!to) return;
    const key = pair(from.id, to.id);
    if (pairs.has(key)) { existed++; return; }
    pairs.add(key);
    // OSC Rx power identifies the segment, not traffic status or an ifOperStatus item.
    planned.push({ from: from.id, to: to.id, host: "", item: "" });
  });
  return { planned, existed };
}