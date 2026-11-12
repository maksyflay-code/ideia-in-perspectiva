import type { Db } from "./db.server";
import { discoverDwdm, planDwdmImport, type DwdmChoice, type DwdmKind, type DiscoveryPop } from "@/lib/dwdm-discovery";
import { listDwdmItems } from "./zabbix.server";
import { planEciRing } from "@/lib/eci-ring";
import { planPadtecRings, PADTEC_SEGMENT_MONITORING, PADTEC_LOSS_DOWN_VALUE } from "@/lib/padtec-rings";
import { listOpticalItems } from "./zabbix.server";
import { PADTEC_MONITOR_HOST } from "@/lib/optical-status";
import { IRECE_OSC_SEGMENT, planEciMonitoring, type EciMonitoringLink } from "@/lib/eci-monitoring";

export async function connectIrece(d: Db) {
  const items = await listDwdmItems("eci");
  d.exec("BEGIN IMMEDIATE");
  try {
    const pops = d.prepare("SELECT id, name, city FROM pops ORDER BY name").all() as DiscoveryPop[];
    const origins = pops.filter((p) => p.name === "eci-irece");
    const targets = pops.filter((p) => p.name === "eci-cafarnaum");
    const from = origins[0], to = targets[0];
    if (origins.length !== 1 || targets.length !== 1 || !from || !to)
      throw new Error("Irecê e Cafarnaum devem ter exatamente um ECI cadastrado cada");
    const links = d.prepare("SELECT * FROM links ORDER BY id").all() as EciMonitoringLink[];
    const exists = links.some((l) => (l.from_pop === from.id && l.to_pop === to.id) || (l.from_pop === to.id && l.to_pop === from.id));
    // Validate the live item and ambiguity before inserting anything.
    planEciMonitoring(pops, links, items, [IRECE_OSC_SEGMENT]);
    if (!exists) {
      d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,?,?,'interface','')")
        .run(from.id, to.id, IRECE_OSC_SEGMENT.host, IRECE_OSC_SEGMENT.item);
    }
    const { updates, preserved, unchanged } = planEciMonitoring(pops, links, items, [IRECE_OSC_SEGMENT]);
    for (const l of updates) d.prepare("UPDATE links SET zabbix_host=?,zabbix_item=?,monitor_kind='interface',optical_down_value='' WHERE id=?").run(l.host, l.item, l.id);
    d.exec("COMMIT");
    return { added: exists ? 0 : 1, applied: exists ? updates.length : 1, preserved, unchanged };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

export async function applyEciMonitoring(d: Db) {
  const items = await listDwdmItems("eci");
  d.exec("BEGIN IMMEDIATE");
  try {
    const pops = d.prepare("SELECT id, name, city FROM pops ORDER BY name").all() as DiscoveryPop[];
    const links = d.prepare("SELECT * FROM links ORDER BY id").all() as EciMonitoringLink[];
    const { updates, ...counts } = planEciMonitoring(pops, links, items);
    const update = d.prepare("UPDATE links SET zabbix_host=?, zabbix_item=?, monitor_kind='interface', optical_down_value='' WHERE id=?");
    for (const l of updates) update.run(l.host, l.item, l.id);
    d.exec("COMMIT");
    return { applied: updates.length, ...counts };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

export async function importPadtecRings(d: Db) {
  // Validate the confirmed loss alarms live before touching the database.
  const live = await listOpticalItems();
  for (const m of PADTEC_SEGMENT_MONITORING)
    if (!live.some((i) => i.itemid === m.item && i.key_ === m.key))
      throw new Error(`Nenhuma ligação criada. Alarme ${m.item} (${m.a}–${m.b}) não encontrado no Padtec - Servidor`);
  d.exec("BEGIN IMMEDIATE");
  try {
    const pops = d.prepare("SELECT id, name, city FROM pops ORDER BY name").all() as DiscoveryPop[];
    const existing = d.prepare("SELECT from_pop, to_pop FROM links").all() as { from_pop: number; to_pop: number }[];
    const { planned, existed, monitoring } = planPadtecRings(pops, existing);
    const ins = d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,'','','interface','')");
    for (const l of planned) ins.run(l.from, l.to);
    // Only fill links that have no monitoring yet; never overwrite an existing configuration.
    const mon = d.prepare("UPDATE links SET zabbix_host=?, zabbix_item=?, monitor_kind='padtec_loss', optical_down_value=? WHERE ((from_pop=? AND to_pop=?) OR (from_pop=? AND to_pop=?)) AND trim(zabbix_item)=''");
    let monitored = 0;
    for (const m of monitoring) monitored += Number(mon.run(PADTEC_MONITOR_HOST, m.item, PADTEC_LOSS_DOWN_VALUE, m.from, m.to, m.to, m.from).changes);
    d.exec("COMMIT");
    return { added: planned.length, existed, monitored };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

export function importEciRing(d: Db) {
  d.exec("BEGIN IMMEDIATE");
  try {
    const pops = d.prepare("SELECT id, name, city FROM pops ORDER BY name").all() as DiscoveryPop[];
    const existing = d.prepare("SELECT from_pop, to_pop FROM links").all() as { from_pop: number; to_pop: number }[];
    const { planned, existed } = planEciRing(pops, existing);
    const ins = d.prepare("INSERT INTO links (from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES (?,?,0,?,?,'interface','')");
    for (const l of planned) ins.run(l.from, l.to, l.host, l.item);
    d.exec("COMMIT");
    return { added: planned.length, existed, unmonitored: planned.length };
  } catch (e) { d.exec("ROLLBACK"); throw e; }
}

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