import type { Link, Network, Pop } from "./network.types";

const DIACRITICS = /[\u0300-\u036f]/g;
const BRAND_PREFIX = /^(sw|padtec|eci|parks)-/i;

/** Lowercase, accent-free, single-spaced token form shared by names, cities and alarm text. */
export function normalizeSite(value: string) {
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Names an alarm may use for this POP: technical name, name without brand prefix, and city. */
export function siteAliases(pop: Pop) {
  const bare = pop.name.replace(BRAND_PREFIX, "");
  return [...new Set([pop.name, bare, pop.city].map(normalizeSite))].filter(
    (alias) => alias.length >= 4 && !/^\d+$/.test(alias),
  );
}

function mentions(text: string, alias: string) {
  if (!alias) return false;
  return ` ${text} `.includes(` ${alias} `);
}

/** POPs whose name or city appears in the alarm text, whole tokens only. */
export function popsInText(text: string, pops: Pop[]) {
  const norm = normalizeSite(text);
  return pops.filter((pop) => siteAliases(pop).some((alias) => mentions(norm, alias)));
}

/** Typing aid: substring match on technical name or city, capped for a short list. */
export function filterPops(query: string, pops: Pop[], limit = 8) {
  const q = normalizeSite(query);
  if (!q) return [];
  return pops
    .filter((pop) => [normalizeSite(pop.name), normalizeSite(pop.city)].some((value) => value.includes(q)))
    .slice(0, limit);
}

const SIGNAL_PATTERNS: [RegExp, string][] = [
  [/loss of signal|\blos\b|perda de sinal/, "perda de sinal óptico"],
  [/loss of sync|perda de sincronismo|\bsync\b/, "perda de sincronismo"],
  [/\blof\b|loss of frame|perda de enquadramento/, "perda de enquadramento (LOF)"],
  [/ifoperstatus|operstatus|link down|porta (down|inativa)/, "porta de interface caída"],
  [/icmpping|\bping\b|unreachable|sem resposta|nao responde/, "equipamento sem resposta de rede"],
  [/power failure|falha de energia|\bac\b/, "falha de energia"],
];

/** Plain-language reading of the alarm text; never decides the segment on its own. */
export function alarmSignals(text: string) {
  const norm = normalizeSite(text);
  return SIGNAL_PATTERNS.filter(([pattern]) => pattern.test(norm)).map(([, label]) => label);
}

export function isMonitored(link: Link) {
  return Boolean(link.zabbix_host && link.zabbix_item);
}

export function monitorLabel(link: Link) {
  if (!isMonitored(link)) return "Sem monitoramento";
  if (link.monitor_kind === "padtec_loss") return "Alarme óptico da Line (Padtec)";
  return "Porta monitorada no Zabbix";
}

/** Fewest-hops route between two POPs over the registered links; null when none exists. */
export function shortestPath(from: number, to: number, links: Link[]): Link[] | null {
  if (from === to) return [];
  const prev = new Map<number, { node: number; link: Link }>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const node = queue.shift()!;
    for (const link of links) {
      const next = link.from_pop === node ? link.to_pop : link.to_pop === node ? link.from_pop : null;
      if (next === null || seen.has(next)) continue;
      prev.set(next, { node, link });
      if (next === to) {
        const path: Link[] = [];
        let current = next;
        while (current !== from) {
          const step = prev.get(current)!;
          path.unshift(step.link);
          current = step.node;
        }
        return path;
      }
      seen.add(next);
      queue.push(next);
    }
  }
  return null;
}

export type TriageDevice = { name: string; via: "selecao" | "texto" };
export type Confidence = "alta" | "media" | "baixa";
export type TriageCandidate = {
  linkId: number;
  from: string;
  to: string;
  confidence: Confidence;
  reasons: string[];
  monitored: boolean;
  monitor: string;
};
export type TriageResult = {
  devices: TriageDevice[];
  candidates: TriageCandidate[];
  signals: string[];
  note: string;
};

const RANK: Record<Confidence, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * Suggests which registered segment a Zabbix alarm most likely affects.
 * Uses only the POPs and links already registered — nothing is written anywhere.
 */
export function triageAlarm({
  text,
  selected,
  network,
}: {
  text: string;
  selected: string[];
  network: Network;
}): TriageResult {
  const pops = network.pops;
  const devices: TriageDevice[] = [];
  const seen = new Set<string>();
  for (const name of selected) {
    const pop = pops.find((p) => p.name === name);
    if (pop && !seen.has(pop.name)) {
      seen.add(pop.name);
      devices.push({ name: pop.name, via: "selecao" });
    }
  }
  for (const pop of popsInText(text, pops)) {
    if (seen.has(pop.name)) continue;
    seen.add(pop.name);
    devices.push({ name: pop.name, via: "texto" });
  }

  const signals = alarmSignals(text);
  if (!devices.length)
    return {
      devices,
      candidates: [],
      signals,
      note: "Nenhum equipamento do mapa foi reconhecido. Selecione ao menos um ou use o nome cadastrado no alarme.",
    };

  const nameOf = (id: number) => pops.find((p) => p.id === id)?.name ?? "?";
  const ids = devices.map((d) => pops.find((p) => p.name === d.name)?.id).filter((id): id is number => id !== undefined);
  const found = new Map<number, TriageCandidate>();
  const notes: string[] = [];

  const add = (link: Link, confidence: Confidence, reason: string) => {
    const existing = found.get(link.id);
    if (existing) {
      if (RANK[confidence] < RANK[existing.confidence]) existing.confidence = confidence;
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    found.set(link.id, {
      linkId: link.id,
      from: nameOf(link.from_pop),
      to: nameOf(link.to_pop),
      confidence,
      reasons: [reason],
      monitored: isMonitored(link),
      monitor: monitorLabel(link),
    });
  };

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      const direct = network.links.find(
        (l) => (l.from_pop === a && l.to_pop === b) || (l.from_pop === b && l.to_pop === a),
      );
      if (direct) {
        add(direct, "alta", `Ligação direta cadastrada entre ${nameOf(a)} e ${nameOf(b)}; os dois aparecem no alarme.`);
        continue;
      }
      const path = shortestPath(a, b, network.links);
      if (!path) {
        notes.push(`Não há caminho cadastrado entre ${nameOf(a)} e ${nameOf(b)}.`);
        continue;
      }
      const route = [nameOf(a), ...path.map((l) => nameOf(l.from_pop === a || l.to_pop === a ? l.to_pop : l.from_pop))];
      for (const hop of path)
        add(hop, "media", `Caminho cadastrado entre ${nameOf(a)} e ${nameOf(b)}: ${route.join(" → ")}.`);
    }
  }

  if (!found.size) {
    const reason =
      devices.length > 1
        ? "Sem ligação direta nem caminho cadastrado entre os equipamentos citados; possível trecho que sai deles."
        : "Só um equipamento foi identificado; estes são os trechos que saem dele.";
    for (const id of ids)
      for (const link of network.links)
        if (link.from_pop === id || link.to_pop === id) add(link, "baixa", reason);
  }

  const candidates = [...found.values()].sort(
    (a, b) => RANK[a.confidence] - RANK[b.confidence] || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  const note = notes.length
    ? [...new Set(notes)].join(" ")
    : candidates.length
      ? ""
      : "Nenhuma ligação cadastrada sai dos equipamentos reconhecidos.";
  return { devices, candidates, signals, note };
}
