import { describe, expect, it } from "vitest";
import { spvlStatus } from "@/lib/link-status";
const now = 1_700_000_000_000;
const it0 = (v: string, key = "cardPart2378_SfpDownAlarmSFP1.[7171]") => ({ itemid: "1", key_: key, lastvalue: v, lastclock: String(now / 1000 - 10), status: "0", state: "0", hosts: [{ host: "Padtec - Servidor" }] });
describe("spvlStatus", () => {
  it("fica vermelho se qualquer ponta alarmar", () => expect(spvlStatus([it0("0"), it0("1")], now).state).toBe("down"));
  it("verde com as duas pontas sem alarme", () => expect(spvlStatus([it0("0"), it0("0")], now).state).toBe("up"));
  it("desconhecido com leitura velha", () => expect(spvlStatus([{ ...it0("0"), lastclock: String(now / 1000 - 900) }], now).state).toBe("unknown"));
  it("ignora item que não é alarme de SFP", () => expect(spvlStatus([it0("1", "cardPart2378_PinSFP1.[7171]")], now).state).toBe("unknown"));
});
