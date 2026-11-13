import type { Db } from "./db.server";

type Pop = { id: number; name: string };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

/** Admin-confirmed links. Switch links monitor the ifOperStatus port confirmed via Zabbix;
 *  Picos ↔ Vila Nova stays unmonitored: no Padtec loss alarm names that pair. */
export const MISSING_LINKS: { label: string; a: string[]; b: string[]; monitor?: { host: string; item: string } }[] = [
  { label: "Lagoa 33 ↔ Angical (switch)", a: ["sw-lagoa33"], b: ["sw-angical"], monitor: { host: "sw-angical", item: "167218" } },
  { label: "Catuaba ↔ Cafarnaum (switch)", a: ["sw-catuaba"], b: ["sw-cafarnaum"], monitor: { host: "sw-cafarnaum", item: "171878" } },
  { label: "Cícero ↔ Lagarto (switch)", a: ["sw-cicero"], b: ["sw-lagarto"], monitor: { host: "sw-cicero", item: "165046" } },
  { label: "Lagarto ↔ Aracaju (switch)", a: ["sw-lagarto"], b: ["sw-aracaju"], monitor: { host: "sw-lagarto", item: "168217" } },
  { label: "Picos ↔ Vila Nova (Padtec)", a: ["padtec-picos", "padtec-pcz"], b: ["padtec-vilanova", "padtec-vln"] },
];

function resolve(pops: Pop[], names: string[]) {
  const wanted = new Set(names.map(norm));
  return pops.filter((p) => wanted.has(norm(p.name)));
}

export function importMissingLinks(d: Db) {
  d.exec("BEGIN IMMEDIATE");
  try {
    const pops = d.prepare("SELECT id, name FROM pops").all() as Pop[];
    const links = d.prepare("SELECT id, from_pop, to_pop, zabbix_item FROM links").all() as { id: number; from_pop: number; to_pop: number; zabbix_item: string }[];
    const plan: [number, number, string, string][] = [];
    let existed = 0, monitored = 0;
    for (const l of MISSING_LINKS) {
      const a = resolve(pops, l.a), b = resolve(pops, l.b);
      if (a.length !== 1 || b.length !== 1)
        throw new Error(`Nenhuma ligação criada: ${l.label} — ponto ${a.length !== 1 ? l.a[0] : l.b[0]} ${(a.length || b.length) > 1 ? "duplicado" : "não encontrado"}`);
      const x = a[0]!.id, y = b[0]!.id;
      const dup = links.find((k) => (k.from_pop === x && k.to_pop === y) || (k.from_pop === y && k.to_pop === x));
      if (dup) {
        existed++;
        if (l.monitor && !dup.zabbix_item.trim()) {
          d.prepare("UPDATE links SET zabbix_host=?, zabbix_item=?, monitor_kind='interface' WHERE id=?").run(l.monitor.host, l.monitor.item, dup.id);
          monitored++;
        }
      } else plan.push([x, y, l.monitor?.host ?? "", l.monitor?.item ?? ""]);
    }
    const ins = d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,?,?,'interface','')");
    for (const [x, y, host, item] of plan) ins.run(x, y, host, item);
    d.exec("COMMIT");
    return { added: plan.length, existed, monitored };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
