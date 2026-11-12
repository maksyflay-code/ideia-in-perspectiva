import { describe, expect, it } from "vitest";
import { planPadtecRings, PADTEC_RING_SEGMENTS } from "../lib/padtec-rings";
const names = ["telxius","candeias","bastiao","jacuipe","fsa","irara","alagoinhas","serrinha","tucano","satiro-dias","cipo","pombal","cicero","euclides","bendego","uaua","pinhoes","juazeiro","massaroca","senhor-do-bonfim","jeremoabo","paulo-afonso","capim-grosso","baixa-grande","vila-nova","juazeiro-do-norte","sousa","morada-nova","mossoro","globenet","fortaleza-globenet","santa-luzia","picos","caninde","sobral"];
const pops = [...names.map((n, i) => ({ id: i + 1, name: `padtec-${n}`, city: n })), { id: 99, name: "sw-fsa", city: "fsa" }];
describe("Padtec rings", () => {
  it("plans the 41 confirmed segments without monitoring", () => {
    const r = planPadtecRings(pops, []);
    expect(PADTEC_RING_SEGMENTS).toHaveLength(41);
    expect(r.planned).toHaveLength(41);
    expect(r.planned.every((l) => !l.item && l.from !== 99 && l.to !== 99)).toBe(true);
  });
  it("closes Bonfim–Capim Grosso and the northern ring", () => {
    const id = (n: string) => pops.find((p) => p.name === `padtec-${n}`)!.id;
    const has = (a: string, b: string) => planPadtecRings(pops, []).planned.some((l) => [l.from, l.to].sort().join() === [id(a), id(b)].sort().join());
    expect(has("senhor-do-bonfim", "capim-grosso")).toBe(true);
    expect(has("juazeiro", "vila-nova")).toBe(true);
    expect(has("morada-nova", "globenet")).toBe(true);
  });
  it("connects Juazeiro–Picos–Canindé–Sobral–Fortaleza with loss alarms", () => {
    const r = planPadtecRings(pops, []);
    const id = (n: string) => pops.find((p) => p.name === `padtec-${n}`)!.id;
    expect(r.monitoring).toEqual([
      { from: id("juazeiro"), to: id("picos"), item: "141616" },
      { from: id("picos"), to: id("caninde"), item: "141611" },
      { from: id("caninde"), to: id("sobral"), item: "157291" },
      { from: id("sobral"), to: id("globenet"), item: "157292" },
    ]);
  });
  it("skips existing links in either direction", () => {
    expect(planPadtecRings(pops, [{ from_pop: 2, to_pop: 1 }]).existed).toBe(1);
  });
  it("creates nothing when a site is missing", () => {
    expect(() => planPadtecRings(pops.filter((p) => p.id !== 16), [])).toThrow("uaua");
  });
});
