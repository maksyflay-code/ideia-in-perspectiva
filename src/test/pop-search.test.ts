import { describe, expect, it } from "vitest";
import { searchPops } from "@/lib/pop-search";
const p = (id: number, name: string, city = "") => ({ id, name, city, lat: 0, lng: 0, notes: "" });
const pops = [p(1, "sw-jacobina", "Jacobina"), p(2, "padtec-cicero", "Cícero Dantas"), p(3, "sw-jacobina2"), p(4, "sw-aracaju")];
describe("searchPops", () => {
  it("acha pela cidade sem acento", () => expect(searchPops(pops, "cicero").map((x) => x.id)).toEqual([2]));
  it("coloca o nome exato primeiro", () => expect(searchPops(pops, "Jacobina")[0]?.id).toBe(1));
  it("busca vazia não retorna nada", () => expect(searchPops(pops, "  ")).toEqual([]));
});
