import { queryZabbix } from "./zabbix.server";
import { trafficGroup, trafficPorts, type TrafficItem, type TrafficPort, type TrafficSelection, type TrafficData, type HistoryValue } from "@/lib/traffic";
import type { Db } from "./db.server";

let discovery: { at: number; ports: TrafficPort[] } | undefined;
let discoveryPending: Promise<TrafficPort[]> | undefined;
let cached: { at: number; key: string; data: TrafficData } | undefined;
let pending: { key: string; promise: Promise<TrafficData> } | undefined;

export function setupTraffic(db: Db) {
  db.exec("CREATE TABLE IF NOT EXISTS traffic_ports (port_id TEXT PRIMARY KEY, traffic_group TEXT NOT NULL CHECK(traffic_group IN ('external','clients')))");
}
export function selectedTraffic(db: Db): TrafficSelection[] {
  setupTraffic(db);
  return (db.prepare("SELECT port_id,traffic_group FROM traffic_ports ORDER BY port_id").all() as { port_id: string; traffic_group: TrafficSelection["group"] }[]).map(s => ({ portId: s.port_id, group: s.traffic_group }));
}
export async function discoverTraffic(): Promise<TrafficPort[]> {
  if (discovery && Date.now() - discovery.at < 300000) return discovery.ports;
  if (discoveryPending) return discoveryPending;
  discoveryPending = (async () => {
    const hosts = await queryZabbix("host.get", { output: ["hostid", "host"], search: { host: "sw-" }, startSearch: true, filter: { status: "0" } }) as { hostid: string; host: string }[];
    const items: TrafficItem[] = [];
    for (let offset = 0; offset < hosts.length; offset += 15) {
      items.push(...await queryZabbix("item.get", {
        output: ["itemid", "hostid", "name", "key_", "units", "lastvalue", "lastclock", "status", "state", "value_type"],
        hostids: hosts.slice(offset, offset + 15).map(h => h.hostid),
        search: { key_: ["net.if.in[", "net.if.out["] }, searchByAny: true,
      }) as TrafficItem[]);
    }
    const ports = trafficPorts(items, hosts);
    discovery = { at: Date.now(), ports };
    return ports;
  })();
  try { return await discoveryPending; } finally { discoveryPending = undefined; }
}

export async function saveTraffic(db: Db, selections: TrafficSelection[]) {
  const ports = await discoverTraffic();
  const valid = new Set(ports.map(p => p.id));
  if (selections.some(s => !valid.has(s.portId))) throw new Error("Uma porta não existe mais no Zabbix; recarregue a lista.");
  if (new Set(selections.map(s => s.portId)).size !== selections.length) throw new Error("Cada porta só pode pertencer a um grupo.");
  setupTraffic(db);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM traffic_ports");
    const insert = db.prepare("INSERT INTO traffic_ports (port_id,traffic_group) VALUES (?,?)");
    for (const s of selections) insert.run(s.portId, s.group);
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  cached = undefined;
  return { ok: true };
}

export async function readTraffic(db: Db): Promise<TrafficData> {
  const selections = selectedTraffic(db);
  const key = JSON.stringify(selections);
  if (cached?.key === key && Date.now() - cached.at < 60000) return cached.data;
  if (pending?.key === key) return pending.promise;
  const load = async (): Promise<TrafficData> => {
    const now = Math.floor(Date.now() / 1000);
    const empty = (error?: string): TrafficData => ({ enabled: selections.length > 0, at: now, ...(error ? { error } : {}), external: trafficGroup([], selections, "external", now), clients: trafficGroup([], selections, "clients", now) });
    if (!selections.length) return empty();
    try {
      const known = await discoverTraffic();
      const selectedIds = new Set(selections.map(s => s.portId));
      const selected = known.filter(p => selectedIds.has(p.id));
      const ids = selected.flatMap(p => [p.rx.itemid, p.tx.itemid]);
      if (!ids.length) return empty("As portas selecionadas não foram encontradas no Zabbix.");
      const latest = await queryZabbix("item.get", { output: ["itemid", "hostid", "name", "key_", "units", "lastvalue", "lastclock", "status", "state", "value_type"], itemids: ids }) as TrafficItem[];
      const ports = trafficPorts(latest, selected.map(p => ({ hostid: p.rx.hostid, host: p.host })));
      const history: HistoryValue[] = [];
      let historyError = false;
      try {
        for (const type of ["0", "3"]) {
          const itemids = latest.filter(i => i.value_type === type).map(i => i.itemid);
          for (let offset = 0; offset < itemids.length; offset += 20) history.push(...await queryZabbix("history.get", {
            output: ["itemid", "clock", "value"], history: Number(type), itemids: itemids.slice(offset, offset + 20), time_from: now - 3600, time_till: now, sortfield: "clock", sortorder: "DESC", limit: 10000,
          }) as HistoryValue[]);
        }
      } catch { historyError = true; }
      const data: TrafficData = { enabled: true, at: now, historyError, external: trafficGroup(ports, selections, "external", now, history), clients: trafficGroup(ports, selections, "clients", now, history) };
      cached = { at: Date.now(), key, data };
      return data;
    } catch { return empty("Não foi possível consultar o tráfego no Zabbix."); }
  };
  pending = { key, promise: load() };
  try { return await pending.promise; } finally { pending = undefined; }
}