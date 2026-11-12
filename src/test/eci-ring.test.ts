import { describe, expect, it } from "vitest";
import { planEciRing } from "../lib/eci-ring";

export const ringPops = [
  "cafarnaum", "bonito", "tapiramuta", "mairi", "riachao", "fsa",
  "serrinha", "valente", "cg", "jacobina", "varzea-nova",
].map((name, index) => ({ id: index + 1, name: `eci-${name}`, city: name.toUpperCase() }));

describe("Confirmed ECI ring", () => {
  it("creates exactly the eleven requested physical segments and closes the ring", () => {
    const result = planEciRing(ringPops, []);
    expect(result.planned.map((l) => [l.from, l.to])).toEqual([
      [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
      [7, 8], [8, 9], [9, 10], [10, 11], [11, 1],
    ]);
    expect(result.existed).toBe(0);
    expect(result.planned.every((l) => l.host === "" && l.item === "")).toBe(true);
  });
  it("skips reversed existing segments without dropping unrelated links", () => {
    const result = planEciRing(ringPops, [{ from_pop: 2, to_pop: 1 }, { from_pop: 1, to_pop: 6 }]);
    expect(result.existed).toBe(1);
    expect(result.planned).toHaveLength(10);
    expect(result.planned.some((l) => l.from === 1 && l.to === 6)).toBe(false);
  });
  it("rejects a missing city instead of making a partial ring or using a switch", () => {
    expect(() => planEciRing([...ringPops.filter((p) => p.id !== 9), { id: 99, name: "sw-cg", city: "CAPIM GROSSO" }], [])).toThrow("Capim Grosso");
  });
  it("rejects ambiguous existing ECI sites", () => {
    expect(() => planEciRing([...ringPops, { id: 99, name: "eci-capimgrosso", city: "CAPIM GROSSO" }], [])).toThrow("mais de um ECI");
  });
});