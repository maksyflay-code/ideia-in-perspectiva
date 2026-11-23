import { describe, expect, it } from "vitest";
import { interfaceGroupStatus, interfaceStatus, type InterfaceItem } from "@/lib/link-status";
const now = 1800000000000;
const p = (v: string): InterfaceItem => ({ itemid: v, key_: "net.if.status[ifOperStatus.1]", lastvalue: v, lastclock: String(now / 1000), status: "0", state: "0", hosts: [{ host: "sw-telxius1" }] });
describe("Telxius x VTAL por grupo de portas", () => {
  it("fica vermelha se uma das portas cair", () => expect(interfaceGroupStatus([p("1"), p("2"), p("1")], "sw-telxius1", now).state).toBe("down"));
  it("fica ativa com todas as portas ativas", () => expect(interfaceGroupStatus([p("1"), p("1")], "sw-telxius1", now).state).toBe("up"));
});
describe("OSC do Datacom", () => {
  it("OSC mgmtOsc.operStatus = 2 deixa o trecho vermelho", () => expect(interfaceStatus({ itemid: "147560", key_: "mgmtOsc.operStatus.[504397827]", lastvalue: "2", lastclock: String(1800000000), status: "0", state: "0", hosts: [{ host: "dci-datacom-telxius" }] }, "dci-datacom-telxius", 1800000000000).state).toBe("down"));
});
