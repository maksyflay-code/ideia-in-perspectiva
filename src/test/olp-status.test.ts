import { describe, expect, it } from "vitest";
import { olpStatus, olpItemIds } from "@/lib/olp-status";
const now = 1800000000000;
const it_ = (v: string) => ({ itemid: "1", key_: "k", lastvalue: v, lastclock: String(now / 1000), status: "0", state: "0", hosts: [{ host: "dci-datacom-brdigital" }] });
const s = (a: string, b: string) => olpStatus([it_(a), it_("-10"), it_(b), it_("-9")], "dci-datacom-brdigital", now).state;
describe("Proteção óptica Globenet × BR Digital", () => {
  it("duas rotas com luz fica ativa", () => expect(s("-7.95", "-8")).toBe("up"));
  it("só a Line 2 sem luz fica amarela", () => expect(s("-7.95", "-40")).toBe("degraded"));
  it("duas rotas sem luz fica vermelha", () => expect(s("-40", "-40")).toBe("down"));
  it("leitura de outro host é desconhecida", () => expect(olpStatus([it_("-40"), it_("-10"), it_("-40"), it_("-9")], "outro", now).state).toBe("unknown"));
  it("exige quatro itens", () => expect(olpItemIds("1,2,3")).toBeNull());
});

import { olpRouteStatus, olpRouteItemIds } from "@/lib/olp-status";
describe("Rota óptica separada (Line 1 / Line 2)", () => {
  const r = (v: string) => olpRouteStatus([it_(v), it_("-10")], "dci-datacom-brdigital", now).state;
  it("rota com luz fica ativa", () => expect(r("-7.95")).toBe("up"));
  it("rota abaixo do limite fica vermelha", () => expect(r("-40")).toBe("down"));
  it("rota de outro host é desconhecida", () => expect(olpRouteStatus([it_("-40"), it_("-10")], "outro", now).state).toBe("unknown"));
  it("exige dois itens", () => expect(olpRouteItemIds("1,2,3")).toBeNull());
});
