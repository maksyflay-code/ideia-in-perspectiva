import type { Pop } from "./network.types";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Busca local entre os pontos cadastrados (nome técnico ou cidade), sem acento e sem serviço externo. */
export function searchPops(pops: Pop[], query: string, limit = 8): Pop[] {
  const q = norm(query);
  if (!q) return [];
  const score = (p: Pop) => {
    const city = norm(p.city), name = norm(p.name).replace(/^(sw|padtec|eci|dci-datacom)-/, "");
    if (city === q || name === q) return 0;
    if (city.startsWith(q) || name.startsWith(q)) return 1;
    if (city.includes(q) || name.includes(q)) return 2;
    return 9;
  };
  return pops.map((p) => [score(p), p] as const).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name)).slice(0, limit).map(([, p]) => p);
}
