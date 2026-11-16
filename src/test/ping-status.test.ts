import { describe, expect, it } from "vitest";
import { pingLost } from "@/lib/ping-status";
const now = 1800000000000;
const it0 = { key_: "icmpping", lastvalue: "0", lastclock: String(now / 1000), status: "0", state: "0" };
describe("Alerta de ping", () => {
  it("pisca com ping 0 recente", () => expect(pingLost(it0, now)).toBe(true));
  it("não pisca com ping 1", () => expect(pingLost({ ...it0, lastvalue: "1" }, now)).toBe(false));
  it("ignora leitura com mais de 300 s", () => expect(pingLost({ ...it0, lastclock: String(now / 1000 - 301) }, now)).toBe(false));
  it("ignora item sem suporte", () => expect(pingLost({ ...it0, state: "1" }, now)).toBe(false));
  it("ignora perda/latência", () => expect(pingLost({ ...it0, key_: "icmppingloss" }, now)).toBe(false));
});
