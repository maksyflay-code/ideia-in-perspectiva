import type { Network, Pop } from "./network.types";

type Camera = {
  project(coords: [number, number]): { x: number; y: number };
  unproject(point: [number, number]): { lng: number; lat: number };
};

export function equipmentType(name: string) {
  if (/^padtec-/i.test(name)) return "padtec";
  if (/^eci-/i.test(name)) return "eci";
  return "sw";
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
    group.sort((a, b) => equipmentType(a.name).localeCompare(equipmentType(b.name)) || a.name.localeCompare(b.name));
    const points = group.map((p) => camera.project([p.lng, p.lat]));
    const center = { x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length };
    const columns = Math.min(group.length, 3);
    const rows = Math.ceil(group.length / columns);
    group.forEach((pop, i) => {
      const row = Math.floor(i / columns);
      const count = Math.min(columns, group.length - row * columns);
      const point = camera.unproject([center.x + ((i % columns) - (count - 1) / 2) * 24, center.y + (row - (rows - 1) / 2) * 24]);
      positions.set(pop.id, [point.lng, point.lat]);
    });
  }
  return positions;
}

export function isDwdmLink(from: Network["pops"][number], to: Network["pops"][number]) {
  return equipmentType(from.name) !== "sw" && equipmentType(to.name) !== "sw";
}