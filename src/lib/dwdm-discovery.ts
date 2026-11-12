export type DwdmKind = "padtec" | "eci";
export type DiscoveryItem = { itemid: string; name: string; key_: string; hosts: { host: string }[] };
export type DiscoveryPop = { id: number; name: string; city: string };
export type DwdmReference = {
  key: string; from: string; suggestedTo: string; destination: string;
  evidence: string[]; item: string; host: string; monitorable: boolean;
};

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Names indicate circuits, not physical adjacency. Unnamed OSC/Lines stay unresolved. */
export function discoverDwdm(kind: DwdmKind, items: DiscoveryItem[], pops: DiscoveryPop[]): DwdmReference[] {
  const refs = new Map<string, DwdmReference>();
  const prefix = kind === "eci" ? "eci-" : "padtec-";
  const targets = pops.filter((p) => p.name.startsWith(prefix));
  for (const i of items) {
    let from = "", destination = "", key = "", monitorable = false;
    if (kind === "padtec") {
      if (!/(?:line|osc|sfp)/i.test(i.name)) continue;
      const m = /^POP:\s*(.+?)\s+-\s+(.+?)\s+-\s+(?:Alarm|IN |OUT |Pin|Pout|Board|Temperature|Chromatic|OSNR|Fator|Q Factor|Real|SFP|SPVL)/i.exec(i.name);
      if (!m?.[1] || !m[2]) continue;
      from = `padtec-${slug(m[1])}`;
      const board = m[2].trim();
      // Keep the entire remote reference: ECN/PAF must not silently become ECN.
      destination = board.split(/\s*<>\s*/).slice(1).join(" <> ").trim();
      if (!destination) destination = /#\d+\s*-\s*(.+)$/.exec(board)?.[1]?.trim() ?? "";
      key = `${from}:${board}`;
    } else {
      from = i.hosts.find((h) => h.host.startsWith("eci-"))?.host ?? "";
      if (!from || !/(?:osc|odu|otuc|line)/i.test(i.name)) continue;
      destination = /\s+-\s+(.+?)\s+-\s+Operation status$/i.exec(i.name)?.[1]?.trim() ?? "";
      monitorable = /^odu\./i.test(i.key_) && /ifOperStatus/i.test(i.key_);
      key = `${from}:${i.key_}`;
    }
    const matches = destination ? targets.filter((p) => p.name !== from && [p.city, p.name.slice(prefix.length)].some((n) => normalize(n) === normalize(destination))) : [];
    const suggestedTo = matches.length === 1 ? matches[0]?.name ?? "" : "";
    const existing = refs.get(key);
    if (existing) { existing.evidence.push(i.name); continue; }
    refs.set(key, { key, from, suggestedTo, destination, evidence: [i.name], item: monitorable ? i.itemid : "", host: monitorable ? from : "", monitorable });
  }
  return [...refs.values()].sort((a, b) => a.from.localeCompare(b.from) || a.key.localeCompare(b.key));
}

export type DwdmChoice = { key: string; to: string };
export type PlannedDwdmLink = { from: number; to: number; host: string; item: string };
export function planDwdmImport(kind: DwdmKind, refs: DwdmReference[], choices: DwdmChoice[], pops: DiscoveryPop[], existing: { from_pop: number; to_pop: number }[]) {
  const planned: PlannedDwdmLink[] = [];
  const pairs = new Set(existing.map((l) => [l.from_pop, l.to_pop].sort((a, b) => a - b).join(":")));
  let existed = 0;
  for (const choice of choices) {
    const ref = refs.find((r) => r.key === choice.key);
    const from = pops.find((p) => p.name === ref?.from);
    const to = pops.find((p) => p.name === choice.to && p.name.startsWith(`${kind}-`));
    if (!ref || !from || !to || from.id === to.id) throw new Error("Origem ou destino inválido; consulte novamente e confirme os equipamentos");
    const pair = [from.id, to.id].sort((a, b) => a - b).join(":");
    if (pairs.has(pair)) { existed++; continue; }
    pairs.add(pair);
    planned.push({ from: from.id, to: to.id, host: ref.host, item: ref.item });
  }
  return { planned, existed };
}