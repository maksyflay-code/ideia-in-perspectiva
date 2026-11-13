import type { Db } from "./db.server";

const HOST = "sw-chapada-coite";
const NOTES = "Portas Zabbix: 1/1/1 JUAZEIRINHO — ifOperStatus ID 186132 (destino pendente); 1/1/2 TELY_TIM_BARJP_0007 — ifOperStatus ID 186133 (saída Tely/TIM). Sem ligações criadas: equipamentos de destino não confirmados.";

/** Explicit admin import from the supplied export; never seeds or invents endpoints. */
export function registerChapadaCoite(d: Db) {
  d.exec("BEGIN IMMEDIATE");
  try {
    const matches = d.prepare("SELECT id FROM pops WHERE name=?").all(HOST) as { id: number }[];
    if (matches.length > 1) throw new Error("Há mais de um sw-chapada-coite cadastrado; corrija a duplicidade antes de continuar");
    const existing = matches[0];
    if (!existing) {
      d.prepare("INSERT INTO pops (name,city,lat,lng,notes) VALUES (?,?,?,?,?)")
        .run(HOST, "Conceição do Coité", -11.6725332, -39.367641, NOTES);
    }
    d.exec("COMMIT");
    return { added: existing ? 0 : 1, pending: 2 };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}