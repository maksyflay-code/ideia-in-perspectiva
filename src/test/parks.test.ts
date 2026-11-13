import { describe, expect, it } from "vitest";
import { equipmentType, filterNetwork, isDwdmLink } from "@/lib/map-layout";
import { PARKS_SEGMENTS } from "@/server/parks.server";

describe("Parks DWDM", () => {
  it("is DWDM, not switch", () => {
    expect(equipmentType("parks-lagarto")).toBe("parks");
    const a = { id: 1, name: "parks-cicero", city: "", lat: 0, lng: 0, notes: "" };
    const b = { ...a, id: 2, name: "parks-lagarto" };
    expect(isDwdmLink(a, b)).toBe(true);
    expect(filterNetwork({ pops: [a, b], links: [], channels: [] }, "dwdm").pops).toHaveLength(2);
  });
  it("uses the OSC-PARKS ports", () => {
    expect(PARKS_SEGMENTS.map((s) => s.item)).toEqual(["165046", "168217"]);
  });
});

import { parksStatus } from "@/lib/parks-status";
describe("Parks marker status", () => {
  it("follows its switch, ignoring non-Parks alarms", () => {
    const r = parksStatus({ "sw-lagarto": { state: "warning", problems: [{ description: "WIFI/ENERGIA down" }] } }, ["parks-lagarto"]);
    expect(r["parks-lagarto"]?.state).toBe("ok");
  });
  it("stays unknown when the switch is unknown", () => {
    const r = parksStatus({ "sw-aracaju": { state: "unknown", problems: [] } }, ["parks-aracaju"]);
    expect(r["parks-aracaju"]?.state).toBe("unknown");
  });
});
