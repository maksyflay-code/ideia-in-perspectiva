import type { Db } from "./db.server";

/** Parks DWDM sites, placed at their switch; each OSC segment is monitored by the switch's OSC-PARKS port (ifOperStatus). */
export const PARKS_SITES = [
  { name: "parks-cicero", sw: "sw-cicero" },
  { name: "parks-lagarto", sw: "sw-lagarto" },
  { name: "parks-aracaju", sw: "sw-aracaju" },
];
export const PARKS_SEGMENTS = [
  { a: "parks-cicero", b: "parks-lagarto", host: "sw-cicero", item: "165046" },
  { a: "parks-lagarto", b: "parks-aracaju", host: "sw-lagarto", item: "168217" },
];

type P = { id: number; name: string; city: string; lat: number; lng: number };

export function importParks(d: Db) {
  d.exec("BEGIN IMMEDIATE");
  try {
    const all = () => d.prepare("SELECT id, name, city, lat, lng FROM pops").all() as P[];
    let pops = all(), popsAdded = 0;
    for (const s of PARKS_SITES) {
      if (pops.some((p) => p.name === s.name)) continue;
      const sw = pops.find((p) => p.name === s.sw);
      if (!sw) throw new Error(`Nada criado: ${s.sw} não está cadastrado`);
      d.prepare("INSERT INTO pops (name, city, lat, lng, notes) VALUES (?,?,?,?,?)").run(s.name, sw.city, sw.lat, sw.lng, "DWDM Parks — mesma localização do switch");
      popsAdded++;
    }
    pops = all();
    const id = (n: string) => pops.find((p) => p.name === n)!.id;
    const links = d.prepare("SELECT id, from_pop, to_pop, zabbix_item FROM links").all() as { id: number; from_pop: number; to_pop: number; zabbix_item: string }[];
    let added = 0, existed = 0;
    for (const s of PARKS_SEGMENTS) {
      const x = id(s.a), y = id(s.b);
      const dup = links.find((l) => (l.from_pop === x && l.to_pop === y) || (l.from_pop === y && l.to_pop === x));
      if (dup) {
        existed++;
        if (!dup.zabbix_item.trim()) d.prepare("UPDATE links SET zabbix_host=?, zabbix_item=?, monitor_kind='interface', optical_down_value='' WHERE id=?").run(s.host, s.item, dup.id);
        continue;
      }
      d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,?,?,'interface','')").run(x, y, s.host, s.item);
      added++;
    }
    d.exec("COMMIT");
    return { popsAdded, added, existed };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
