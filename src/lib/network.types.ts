export type Pop = { id: number; name: string; city: string; lat: number; lng: number; notes: string };
export type Link = {
  id: number;
  from_pop: number;
  to_pop: number;
  distance_km: number;
  zabbix_host: string;
  zabbix_item: string;
  monitor_kind?: "interface" | "padtec_loss" | "olp_power" | "interface_group" | "padtec_spvl";
  optical_down_value?: string;
};
export type Channel = {
  id: number;
  name: string;
  primary_path: number[];
  secondary_path: number[];
};
export type Network = { pops: Pop[]; links: Link[]; channels: Channel[] };

export function pathDistance(path: number[], links: Link[]) {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const l = links.find(
      (x) => (x.from_pop === a && x.to_pop === b) || (x.from_pop === b && x.to_pop === a),
    );
    if (l) total += l.distance_km;
  }
  return total;
}

/** Returns the hops of a path that have no registered fiber link. */
export function missingHops(path: number[], links: Link[]) {
  const out: [number, number][] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const ok = links.some(
      (x) => (x.from_pop === a && x.to_pop === b) || (x.from_pop === b && x.to_pop === a),
    );
    if (!ok) out.push([a, b]);
  }
  return out;
}
