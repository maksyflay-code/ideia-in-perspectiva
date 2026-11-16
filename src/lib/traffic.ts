export type TrafficItem = { itemid: string; hostid: string; name: string; key_: string; units: string; lastvalue: string; lastclock: string; status: string; state: string; value_type: string };
export type TrafficPort = { id: string; host: string; label: string; rx: TrafficItem; tx: TrafficItem };
export type TrafficSelection = { portId: string; group: "external" | "clients" };
export type TrafficPoint = { clock: number; download: number | null; upload: number | null };
export type TrafficGroup = { count: number; missing: number; download: number | null; upload: number | null; series: TrafficPoint[] };
export type TrafficData = { enabled: boolean; error?: string; historyError?: boolean; at: number; external: TrafficGroup; clients: TrafficGroup };
export type HistoryValue = { itemid: string; clock: string; value: string };

export function trafficPorts(items: TrafficItem[], hosts: { hostid: string; host: string }[]): TrafficPort[] {
  const names = new Map(hosts.map(h => [h.hostid, h.host]));
  const pairs = new Map<string, { rx?: TrafficItem; tx?: TrafficItem }>();
  for (const item of items) {
    const match = /^net\.if\.(in|out)\[if(?:HC)?(?:In|Out)Octets\.(\d+)\]$/.exec(item.key_);
    if (!match || item.units !== "bps" || !names.get(item.hostid)?.startsWith("sw-")) continue;
    const id = `${item.hostid}:${match[2]}`;
    const pair = pairs.get(id) ?? {};
    const direction = match[1] === "in" ? "rx" : "tx";
    // Ambiguous duplicate counters must not silently pick a second measurement.
    if (pair[direction]) continue;
    pair[direction] = item;
    pairs.set(id, pair);
  }
  const ports: TrafficPort[] = [];
  for (const [id, pair] of pairs) {
    const host = pair.rx && names.get(pair.rx.hostid);
    if (!host || !pair.rx || !pair.tx) continue;
    ports.push({ id, host, label: pair.rx.name.replace(/^Interface\s*/i, "").replace(/:\s*Bits received.*$/i, ""), rx: pair.rx, tx: pair.tx });
  }
  return ports.sort((a, b) => `${a.host} ${a.label}`.localeCompare(`${b.host} ${b.label}`));
}

export function rate(item: TrafficItem, now: number): number | null {
  const clock = Number(item.lastclock);
  const value = Number(item.lastvalue);
  if (item.units !== "bps" || item.status !== "0" || item.state !== "0" || !item.lastvalue.trim() || !Number.isFinite(value) || value < 0 || clock <= 0 || now - clock > 300 || clock > now + 5) return null;
  return value / 1e9;
}

export function trafficGroup(ports: TrafficPort[], selections: TrafficSelection[], group: TrafficSelection["group"], now: number, history: HistoryValue[] = []): TrafficGroup {
  const chosen = [...new Set(selections.filter(s => s.group === group).map(s => s.portId))];
  const byId = new Map(ports.map(p => [p.id, p]));
  let download = 0, upload = 0, missing = 0;
  const itemIds: { download: string; upload: string }[] = [];
  for (const id of chosen) {
    const port = byId.get(id);
    if (!port) { missing++; continue; }
    // External RX enters our network; client TX leaves our network towards customers.
    const downItem = group === "external" ? port.rx : port.tx;
    const upItem = group === "external" ? port.tx : port.rx;
    const down = rate(downItem, now), up = rate(upItem, now);
    if (down === null || up === null) missing++;
    else { download += down; upload += up; }
    itemIds.push({ download: downItem.itemid, upload: upItem.itemid });
  }
  const buckets = new Map<number, Map<string, { clock: number; value: number }>>();
  for (const h of history) {
    const clock = Number(h.clock), value = Number(h.value);
    if (!Number.isFinite(clock) || !h.value.trim() || !Number.isFinite(value) || value < 0 || clock < now - 3600 || clock > now) continue;
    const bucket = Math.floor(clock / 60) * 60;
    const values = buckets.get(bucket) ?? new Map();
    if (clock >= (values.get(h.itemid)?.clock ?? 0)) values.set(h.itemid, { clock, value: value / 1e9 });
    buckets.set(bucket, values);
  }
  const series: TrafficPoint[] = [];
  if (chosen.length) for (let clock = Math.floor((now - 3540) / 60) * 60; clock <= Math.floor(now / 60) * 60; clock += 60) {
    const values = buckets.get(clock);
    let d = 0, u = 0;
    let complete = itemIds.length === chosen.length;
    for (const ids of itemIds) {
      const dv = values?.get(ids.download), uv = values?.get(ids.upload);
      if (!dv || !uv) { complete = false; break; }
      d += dv.value; u += uv.value;
    }
    series.push({ clock, download: complete ? d : null, upload: complete ? u : null });
  }
  return { count: chosen.length, missing, download: chosen.length && !missing ? download : null, upload: chosen.length && !missing ? upload : null, series };
}