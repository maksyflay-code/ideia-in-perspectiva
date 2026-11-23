import type { Network, Pop } from "./network.types";

type Camera = {
  project(coords: [number, number]): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
};

export function equipmentType(name: string) {
  if (/^padtec-/i.test(name)) return "padtec";
  if (/^eci-/i.test(name)) return "eci";
  if (/^parks-/i.test(name)) return "parks";
  return "sw";
}

/** Marker label: switches show only the site name, DWDM keeps the brand on its own line. */
export function mapLabel(name: string) {
  if (equipmentType(name) === "sw") return name.replace(/^sw-/i, "");
  return name.replace(/^(padtec|eci|parks)-/i, "$1\n");
}

/** Screen-only displacement; both markers and fiber paths use these positions. */
export function displayPositions(pops: Pop[], camera?: Camera) {
  const positions = new Map(pops.map((p) => [p.id, [p.lng, p.lat] as [number, number]]));
  if (!camera) return positions;
  const groups: Pop[][] = [];
  for (const pop of pops) {
    const point = camera.project([pop.lng, pop.lat]);
    const group = groups.find((members) => members.some((member) => {
      const other = camera.project([member.lng, member.lat]);
      return Math.hypot(point.x - other.x, point.y - other.y) <= 22;
    }));
    if (group) group.push(pop);
    else groups.push([pop]);
  }
  for (const group of groups) {
    if (group.length < 2) continue;
    const points = group.map((p) => camera.project([p.lng, p.lat]));
    const cx = points.reduce((n, p) => n + p.x, 0) / points.length;
    const cy = points.reduce((n, p) => n + p.y, 0) / points.length;
    // Side by side, 24px apart, so each equipment keeps its own Zabbix color.
    const sorted = [...group].sort((a, b) => equipmentType(a.name).localeCompare(equipmentType(b.name)) || a.name.localeCompare(b.name));
    sorted.forEach((pop, i) => {
      const at = camera.unproject([cx + (i - (sorted.length - 1) / 2) * 24, cy]);
      positions.set(pop.id, [at.lng, at.lat]);
    });
  }
  return positions;
}

export function isDwdmLink(from: Network["pops"][number], to: Network["pops"][number]) {
  return equipmentType(from.name) !== "sw" && equipmentType(to.name) !== "sw";
}
/** Splits the saved network into the switch map or the DWDM (Padtec/ECI) map without copying data. */
export function filterNetwork(net: Network, kind: "sw" | "dwdm"): Network {
  const pops = net.pops.filter((p) => (equipmentType(p.name) === "sw") === (kind === "sw"));
  const ids = new Set(pops.map((p) => p.id));
  return {
    pops,
    links: net.links.filter((l) => ids.has(l.from_pop) && ids.has(l.to_pop)),
    channels: net.channels.filter((c) => [...c.primary_path, ...c.secondary_path].every((id) => ids.has(id))),
  };
}
