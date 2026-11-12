import { describe, expect, it } from "vitest";
import { discoverDwdm, planDwdmImport, type DiscoveryItem } from "../lib/dwdm-discovery";

const pops = [
  { id: 1, name: "padtec-santa-luzia", city: "SANTA LUZIA" },
  { id: 2, name: "padtec-paulo-afonso", city: "PAULO AFONSO" },
  { id: 3, name: "eci-cafarnaum", city: "CAFARNAUM" },
  { id: 4, name: "eci-fsa", city: "FSA" },
];
const item = (name: string, key_ = "cardPart2702_alarmLossLine1.[1302]", itemid = "100"): DiscoveryItem => ({ name, key_, itemid, hosts: [{ host: "Padtec - Servidor" }] });
describe("DWDM discovery and confirmed import", () => {
  it("lists more than the previous three Padtec links without a fixed limit", () => {
    const refs = discoverDwdm("padtec", Array.from({ length: 6 }, (_, n) => item(`POP: SANTA LUZIA - TM800G-LT#${n} - PAF - Alarm Loss (Line 1)`)), pops);
    expect(refs).toHaveLength(6);
    expect(refs.every((r) => r.suggestedTo === "")).toBe(true);
  });
  it("groups measurements of one Padtec board without inferring alarm polarity", () => {
    const refs = discoverDwdm("padtec", [item("POP: SANTA LUZIA - TM800G-LT#1302 - PAF - Alarm Loss (Line 1)"), item("POP: SANTA LUZIA - TM800G-LT#1302 - PAF - Pin (Line 2)")], pops);
    expect(refs).toHaveLength(1); expect(refs[0]?.evidence).toHaveLength(2); expect(refs[0]?.item).toBe("");
  });
  it("retains compound destination references without guessing a city", () => {
    const r = discoverDwdm("padtec", [item("POP: SANTA LUZIA - TMD400G-SD#885 <> ECN/PAF - Alarm Loss (Line 1)")], pops)[0];
    expect(r?.destination).toBe("ECN/PAF"); expect(r?.suggestedTo).toBe("");
  });
  it("keeps unnamed OSC visible but unmonitored", () => {
    const r = discoverDwdm("eci", [{ ...item("OSC: Interface osc100-u1/0 - Operation status", "ifOperStatus.[21]"), hosts: [{ host: "eci-cafarnaum" }] }], pops)[0];
    expect(r?.destination).toBe(""); expect(r?.item).toBe(""); expect(r?.suggestedTo).toBe("");
  });
  it("suggests exact ODU destination and preserves monitoring item", () => {
    const r = discoverDwdm("eci", [{ ...item("ODU: Interface otuc2-u4/0 - FSA - Operation status", "odu.ifOperStatus.[351]", "100168"), hosts: [{ host: "eci-cafarnaum" }] }], pops)[0];
    expect(r?.suggestedTo).toBe("eci-fsa"); expect(r?.item).toBe("100168");
  });
  const refs = discoverDwdm("padtec", [item("POP: SANTA LUZIA - TM800G-LT#1302 - PAF - Alarm Loss (Line 1)")], pops);
  const key = refs[0]?.key ?? "";
  it("requires a real destination of the same equipment type", () => {
    expect(() => planDwdmImport("padtec", refs, [{ key, to: "eci-fsa" }], pops, [])).toThrow();
    expect(() => planDwdmImport("padtec", refs, [{ key, to: "missing" }], pops, [])).toThrow();
  });
  it("does not recreate an existing reversed link or replace its monitoring", () => {
    expect(planDwdmImport("padtec", refs, [{ key, to: "padtec-paulo-afonso" }], pops, [{ from_pop: 2, to_pop: 1 }])).toEqual({ planned: [], existed: 1 });
  });
  it("imports a confirmed Padtec circuit without invented monitoring", () => {
    expect(planDwdmImport("padtec", refs, [{ key, to: "padtec-paulo-afonso" }], pops, []).planned).toEqual([{ from: 1, to: 2, host: "", item: "" }]);
  });
  it("deduplicates two selected references of the same pair", () => {
    expect(planDwdmImport("padtec", refs, [{ key, to: "padtec-paulo-afonso" }, { key, to: "padtec-paulo-afonso" }], pops, []).planned).toHaveLength(1);
  });
});