import type { Db } from "./db.server";

export const FORTALEZA_POPS = [
  { name: "dci-datacom-globenet", city: "FORTALEZA (GLOBENET)", lat: -3.7333935, lng: -38.45755578 },
  { name: "dci-datacom-brdigital", city: "FORTALEZA (BR DIGITAL)", lat: -3.752937, lng: -38.528399 },
] as const;
// Read on the BR Digital side, where the Zabbix trigger lives: input/threshold for Line 1 and Line 2.
export const FORTALEZA_OLP = { host: "dci-datacom-brdigital", items: "161759,161757,161760,161758" };

export function importFortalezaOlp(d: Db) {
  d.exec("BEGIN IMMEDIATE");
  try {
    let popsAdded = 0;
    const ids: number[] = [];
    for (const p of FORTALEZA_POPS) {
      const found = d.prepare("SELECT id FROM pops WHERE name=?").all(p.name) as { id: number }[];
      if (found.length > 1) throw new Error(`Nada criado: existe mais de um ponto ${p.name}.`);
      if (found[0]) { ids.push(found[0].id); continue; }
      const r = d.prepare("INSERT INTO pops(name,city,lat,lng,notes) VALUES(?,?,?,?,'')").run(p.name, p.city, p.lat, p.lng);
      ids.push(Number(r.lastInsertRowid)); popsAdded++;
    }
    const [a, b] = ids as [number, number];
    const links = d.prepare("SELECT id,zabbix_item FROM links WHERE (from_pop=? AND to_pop=?) OR (from_pop=? AND to_pop=?)").all(b, a, a, b) as { id: number; zabbix_item: string }[];
    let added = 0, monitored = 0, preserved = 0;
    const blank = links.find((l) => !l.zabbix_item.trim());
    if (links.some((l) => l.zabbix_item === FORTALEZA_OLP.items)) preserved++;
    else if (blank) { d.prepare("UPDATE links SET zabbix_host=?,zabbix_item=?,monitor_kind='olp_power',optical_down_value='' WHERE id=?").run(FORTALEZA_OLP.host, FORTALEZA_OLP.items, blank.id); monitored++; }
    else if (links.length) preserved++;
    else { d.prepare("INSERT INTO links(from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES(?,?,0,?,?,'olp_power','')").run(b, a, FORTALEZA_OLP.host, FORTALEZA_OLP.items); added++; }
    d.exec("COMMIT");
    return { popsAdded, added, monitored, preserved };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}
