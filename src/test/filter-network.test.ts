import { describe, expect, it } from "vitest";
import { filterNetwork } from "@/lib/map-layout";
const pop = (id: number, name: string) => ({ id, name, city: "", lat: 0, lng: 0, notes: "" });
const net = {
  pops: [pop(1, "sw-paf"), pop(2, "padtec-paulo-afonso"), pop(3, "eci-jacobina"), pop(4, "sw-bonfim")],
  links: [1, 2, 3].map((id) => ({ id, from_pop: id, to_pop: id + 1, distance_km: 1, zabbix_host: "", zabbix_item: "" })),
  channels: [],
};
describe("filterNetwork", () => {
  it("DWDM map shows only Padtec/ECI and their links", () => {
    const d = filterNetwork(net, "dwdm");
    expect(d.pops.map((p) => p.id)).toEqual([2, 3]);
    expect(d.links.map((l) => l.id)).toEqual([2]);
  });
  it("switch map hides Padtec/ECI", () => {
    expect(filterNetwork(net, "sw").pops.map((p) => p.id)).toEqual([1, 4]);
    expect(filterNetwork(net, "sw").links).toEqual([]);
  });
});
