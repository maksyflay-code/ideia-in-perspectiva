import type { DiscoveryItem, DiscoveryPop } from "./dwdm-discovery";

// Dashboard OSC port/destination titles + uploaded Zabbix item export.
export const ECI_OSC_SEGMENTS = [
  { host: "eci-cafarnaum", to: "eci-bonito", item: "99713", port: "osc100-u0/0" },
  { host: "eci-bonito", to: "eci-tapiramuta", item: "99554", port: "osc100-u2/0" },
  { host: "eci-tapiramuta", to: "eci-mairi", item: "99545", port: "osc100-u1/0" },
  { host: "eci-mairi", to: "eci-riachao", item: "99525", port: "osc100-u2/0" },
  { host: "eci-riachao", to: "eci-fsa", item: "99516", port: "osc100-u1/0" },
  { host: "eci-serrinha", to: "eci-fsa", item: "120896", port: "osc100-u3/0" },
  { host: "eci-valente", to: "eci-serrinha", item: "99478", port: "osc100-u2/0" },
  { host: "eci-valente", to: "eci-cg", item: "180878", port: "osc100-u1/0" },
  { host: "eci-cg", to: "eci-jacobina", item: "99486", port: "osc100-u1/0" },
  { host: "eci-jacobina", to: "eci-varzeanova", item: "99469", port: "osc100-u0/0" },
  { host: "eci-cafarnaum", to: "eci-varzeanova", item: "99714", port: "osc100-u3/0" },
];

export type EciMonitoringLink = { id: number; from_pop: number; to_pop: number; zabbix_host: string; zabbix_item: string; monitor_kind: string };

export const IRECE_OSC_SEGMENT = { host: "eci-irece", to: "eci-cafarnaum", item: "169620", port: "osc100-u1/0" };

export function planEciMonitoring(pops: DiscoveryPop[], links: EciMonitoringLink[], items: DiscoveryItem[], segments = ECI_OSC_SEGMENTS) {
  const updates: { id: number; host: string; item: string }[] = [];
  let missing = 0, preserved = 0, unchanged = 0;
  for (const segment of segments) {
    const item = items.find((i) => i.itemid === segment.item);
    if (!item || !item.hosts.some((h) => h.host === segment.host) ||
      !/^ifOperStatus\.\[\d+\]$/.test(item.key_) ||
      item.name !== `OSC: Interface ${segment.port} - Operation status`)
      throw new Error(`Item OSC ${segment.item} de ${segment.host} não corresponde no Zabbix; nenhuma alteração aplicada`);
    const from = pops.filter((p) => p.name === segment.host);
    const to = pops.filter((p) => p.name === segment.to);
    if (from.length > 1 || to.length > 1) throw new Error("Equipamentos ECI duplicados; ajuste os cadastros antes de aplicar");
    const a = from[0], b = to[0];
    if (!a || !b) { missing++; continue; }
    const matches = links.filter((l) => (l.from_pop === a.id && l.to_pop === b.id) || (l.from_pop === b.id && l.to_pop === a.id));
    if (!matches.length) { missing++; continue; }
    if (matches.length > 1) throw new Error(`Mais de uma ligação entre ${segment.host} e ${segment.to}; revise antes de aplicar`);
    const link = matches[0];
    if (!link) continue;
    if (link.zabbix_host === segment.host && link.zabbix_item === segment.item && link.monitor_kind === "interface") { unchanged++; continue; }
    if (link.zabbix_host.trim() || link.zabbix_item.trim() || link.monitor_kind !== "interface") { preserved++; continue; }
    updates.push({ id: link.id, host: segment.host, item: segment.item });
  }
  return { updates, missing, preserved, unchanged };
}