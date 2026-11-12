import type { DiscoveryPop, PlannedDwdmLink } from "./dwdm-discovery";

// Segments from the admin's Grafana "Resumo do anel" OSC dashboards (4 rings), deduplicated.
const SITES: Record<string, string[]> = {
  telxius: ["telxius"], candeias: ["candeias"], bastiao: ["bastiao", "saosebastiao", "saosebastiaodopasse", "see"],
  jacuipe: ["jacuipe"], fsa: ["fsa", "feiradesantana", "feira"], irara: ["irara"], alagoinhas: ["alagoinhas"],
  serrinha: ["serrinha"], tucano: ["tucano"], satiro: ["satirodias", "satiro"], cipo: ["cipo"],
  pombal: ["pombal", "ribeiradopombal"], cicero: ["cicero", "cicerodantas"], euclides: ["euclides", "euclidesdacunha"],
  bendego: ["bendego"], uaua: ["uaua"], pinhoes: ["pinhoes"], juazeiro: ["juazeiro"], massaroca: ["massaroca"],
  bonfim: ["senhordobonfim", "bonfim"], jeremoabo: ["jeremoabo"], pauloafonso: ["pauloafonso", "paf"],
  capimgrosso: ["capimgrosso", "cg"], baixagrande: ["baixagrande", "bxg"],
  vilanova: ["vilanova", "vln"], juazeirodonorte: ["juazeirodonorte", "jne"], sousa: ["sousa", "sza"],
  moradanova: ["moradanova", "mnv"], mossoro: ["mossoro", "mro"], fortaleza: ["globenet", "fortalezaglobenet", "fla"],
  santaluzia: ["santaluzia", "slz"],
  picos: ["picos", "pcz"], caninde: ["caninde"], sobral: ["sobral"],
};
export const PADTEC_RING_SEGMENTS: [string, string][] = [
  ["telxius", "candeias"], ["telxius", "bastiao"], ["candeias", "jacuipe"], ["jacuipe", "fsa"], ["fsa", "serrinha"],
  ["fsa", "irara"], ["irara", "serrinha"], ["irara", "alagoinhas"], ["alagoinhas", "bastiao"],
  ["serrinha", "tucano"], ["serrinha", "satiro"], ["satiro", "cipo"], ["cipo", "pombal"], ["pombal", "tucano"],
  ["pombal", "cicero"], ["tucano", "euclides"],
  ["euclides", "bendego"], ["euclides", "cicero"], ["bendego", "uaua"], ["uaua", "pinhoes"], ["pinhoes", "juazeiro"],
  ["juazeiro", "massaroca"], ["massaroca", "bonfim"],
  ["cicero", "jeremoabo"], ["jeremoabo", "pauloafonso"],
  // Admin-confirmed Bonfim–Capim Grosso; CG<>BXG amplifier labels on both sides.
  ["bonfim", "capimgrosso"], ["capimgrosso", "baixagrande"],
  // Northern ring from TMD400G degree labels (JUZ ECN/VLN, VLN JNE/JUZ, JNE SZA/VLN, SZA MNV/JNE+SLZ, MNV FLA/MRO+SZA, MRO FLA/MNV+SLZ, GLOBENET MNV/MRO, SLZ PAF).
  ["juazeiro", "vilanova"], ["vilanova", "juazeirodonorte"], ["juazeirodonorte", "sousa"], ["sousa", "moradanova"],
  ["sousa", "santaluzia"], ["moradanova", "fortaleza"], ["moradanova", "mossoro"], ["mossoro", "fortaleza"],
  ["mossoro", "santaluzia"], ["santaluzia", "pauloafonso"],
  // TM800G circuit pairs matched by chromatic dispersion on both ends; Sobral–Fortaleza admin-confirmed.
  ["juazeiro", "picos"], ["picos", "caninde"], ["caninde", "sobral"], ["sobral", "fortaleza"],
];

/** Loss-of-signal alarms (Padtec - Servidor) for segments; 0 = no alarm while the line carries signal. */
export const PADTEC_SEGMENT_MONITORING: { a: string; b: string; item: string; key: string }[] = [
  { a: "juazeiro", b: "picos", item: "141616", key: "cardPart2702_alarmLossLine1.[1320]" },
  { a: "picos", b: "caninde", item: "141611", key: "cardPart2702_alarmLossLine1.[1292]" },
  { a: "caninde", b: "sobral", item: "157291", key: "cardPart2702_alarmLossLine1.[1297]" },
  { a: "sobral", b: "fortaleza", item: "157292", key: "cardPart2702_alarmLossLine2.[1297]" },
  // Direct neighbours whose two ends show matching chromatic dispersion (same fiber span).
  { a: "juazeiro", b: "vilanova", item: "162237", key: "cardPart2762_alarmLossLine2.[763]" },
  { a: "vilanova", b: "juazeirodonorte", item: "162222", key: "cardPart2762_alarmLossLine1.[763]" },
  { a: "juazeirodonorte", b: "sousa", item: "162225", key: "cardPart2762_alarmLossLine1.[755]" },
  { a: "sousa", b: "moradanova", item: "162223", key: "cardPart2762_alarmLossLine1.[770]" },
  { a: "moradanova", b: "fortaleza", item: "162227", key: "cardPart2762_alarmLossLine1.[776]" },
  { a: "moradanova", b: "mossoro", item: "162242", key: "cardPart2762_alarmLossLine2.[776]" },
  { a: "telxius", b: "candeias", item: "162221", key: "cardPart2762_alarmLossLine1.[775]" },
  { a: "serrinha", b: "tucano", item: "167509", key: "cardPart2545_alarmLossLine1.[668]" },
  { a: "fsa", b: "serrinha", item: "168917", key: "cardPart2545_alarmLossLine1.[193]" },
  { a: "euclides", b: "cicero", item: "164627", key: "cardPart2762_alarmLossLine1.[774]" },
];
export const PADTEC_LOSS_DOWN_VALUE = "1";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type PadtecMonitorUpdate = { from: number; to: number; item: string };
export function planPadtecRings(pops: DiscoveryPop[], existing: { from_pop: number; to_pop: number }[]) {
  const ids: Record<string, number> = {};
  const problems: string[] = [];
  for (const [site, aliases] of Object.entries(SITES)) {
    // Aliases are tried in order so a preferred exact name wins over a looser one.
    let m: DiscoveryPop[] = [];
    for (const a of aliases) { m = pops.filter((p) => p.name.startsWith("padtec-") && norm(p.name.slice(7)) === a); if (m.length) break; }
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
  const monitoring: PadtecMonitorUpdate[] = PADTEC_SEGMENT_MONITORING.map((m) => ({ from: ids[m.a]!, to: ids[m.b]!, item: m.item }));
  return { planned, existed, monitoring };
}
