import { describe, expect, it } from "vitest";
import { displayPositions } from "@/lib/map-layout";
import type { Pop } from "@/lib/network.types";

const cam = {
  project: ([lng, lat]: [number, number]) => ({ x: lng * 100, y: lat * 100 }),
  unproject: ([x, y]: [number, number]) => ({ lng: x / 100, lat: y / 100 }),
};
const pop = (id: number, lng: number): Pop => ({ id, name: `sw-${id}`, city: "", lat: -12, lng, notes: "" } as Pop);

describe("espalhamento só no mesmo local", () => {
  it("cidades distantes ficam na posição real mesmo com zoom afastado", () => {
    const pops = [pop(1, -40), pop(2, -40.1), pop(3, -40.2)];
    const pos = displayPositions(pops, cam);
    pops.forEach((p) => expect(pos.get(p.id)).toEqual([p.lng, p.lat]));
  });
});
