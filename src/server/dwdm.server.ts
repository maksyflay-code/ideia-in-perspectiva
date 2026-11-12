import type { Db } from "./db.server";
import { discoverDwdm, planDwdmImport, type DwdmChoice, type DwdmKind, type DiscoveryPop } from "@/lib/dwdm-discovery";
import { listDwdmItems } from "./zabbix.server";

export async function reviewDwdm(d: Db, kind: DwdmKind) {
  const items = await listDwdmItems(kind);
  const pops = d.prepare("SELECT id, name, city FROM pops ORDER BY name").all() as DiscoveryPop[];
  return { references: discoverDwdm(kind, items, pops), pops: pops.filter((p) => p.name.startsWith(`${kind}-`)), itemCount: items.length };
}

export async function importReviewedDwdm(d: Db, kind: DwdmKind, choices: DwdmChoice[]) {
  const review = await reviewDwdm(d, kind);
  const existing = d.prepare("SELECT from_pop, to_pop FROM links").all() as { from_pop: number; to_pop: number }[];
  const { planned, existed } = planDwdmImport(kind, review.references, choices, review.pops, existing);
  const ins = d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,?,?,'interface','')");
  d.exec("BEGIN IMMEDIATE");
  try {
    for (const l of planned) ins.run(l.from, l.to, l.host, l.item);
    d.exec("COMMIT");
  } catch (e) { d.exec("ROLLBACK"); throw e; }
  return { added: planned.length, existed, unmonitored: planned.filter((l) => !l.item).length };
}