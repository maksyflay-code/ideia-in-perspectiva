import type { DiscoveryPop, PlannedDwdmLink } from "./dwdm-discovery";

// Segments from the admin's Grafana "Resumo do anel" OSC dashboards (4 rings), deduplicated.
const SITES: Record<string, string[]> = {
  telxius: ["telxius"], candeias: ["candeias"], bastiao: ["bastiao", "saosebastiao", "saosebastiaodopasse", "see"],
  jacuipe: ["jacuipe"], fsa: ["fsa", "feiradesantana", "feira"], irara: ["irara"], alagoinhas: ["alagoinhas"],
  serrinha: ["serrinha"], tucano: ["tucano"], satiro: ["satirodias", "satiro"], cipo: ["cipo"],
  pombal: ["pombal", "ribeiradopombal"], cicero: ["cicero", "cicerodantas"], euclides: ["euclides", "euclidesdacunha"],
  bendego: ["bendego"], uaua: ["uaua"], pinhoes: ["pinhoes"], juazeiro: ["juazeiro"], massaroca: ["massaroca"],
  bonfim: ["senhordobonfim", "bonfim"], jeremoabo: ["jeremoabo"], pauloafonso: ["pauloafonso", "paf"],
};
export const PADTEC_RING_SEGMENTS: [string, string][] = [
  ["telxius", "candeias"], ["telxius", "bastiao"], ["candeias", "jacuipe"], ["jacuipe", "fsa"], ["fsa", "serrinha"],
  ["fsa", "irara"], ["irara", "serrinha"], ["irara", "alagoinhas"], ["alagoinhas", "bastiao"],
  ["serrinha", "tucano"], ["serrinha", "satiro"], ["satiro", "cipo"], ["cipo", "pombal"], ["pombal", "tucano"],
  ["pombal", "cicero"], ["tucano", "euclides"],
  ["euclides", "bendego"], ["euclides", "cicero"], ["bendego", "uaua"], ["uaua", "pinhoes"], ["pinhoes", "juazeiro"],
  ["juazeiro", "massaroca"], ["massaroca", "bonfim"],
  ["cicero", "jeremoabo"], ["jeremoabo", "pauloafonso"],
];

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function planPadtecRings(pops: DiscoveryPop[], existing: { from_pop: number; to_pop: number }[]) {
  const ids: Record<string, number> = {};
  const problems: string[] = [];
  for (const [site, aliases] of Object.entries(SITES)) {
    const m = pops.filter((p) => p.name.startsWith("padtec-") && aliases.includes(norm(p.name.slice(7))));
    if (m.length !== 1 || !m[0]) problems.push(`${site}: ${m.length ? "mais de um Padtec" : "Padtec não cadastrado"}`);
    else ids[site] = m[0].id;
  }
  if (problems.length) throw new Error(`Nenhuma ligação criada. ${problems.join("; ")}`);
  const pair = (a: number, b: number) => [a, b].sort((x, y) => x - y).join(":");
  const pairs = new Set(existing.map((l) => pair(l.from_pop, l.to_pop)));
  const planned: PlannedDwdmLink[] = [];
  let existed = 0;
  for (const [a, b] of PADTEC_RING_SEGMENTS) {
    const from = ids[a]!, to = ids[b]!;
    const key = pair(from, to);
    if (pairs.has(key)) { existed++; continue; }
    pairs.add(key);
    planned.push({ from, to, host: "", item: "" });
  }
  return { planned, existed };
}
