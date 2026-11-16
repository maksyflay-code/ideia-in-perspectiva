import type { TrafficPort, TrafficSelection } from "./traffic";

// Explicitly confirmed by the operator; never derived from interface keywords.
export const CONFIRMED_INTERNET = [
  { host: "sw-telxius1", rx: "86965", tx: "87033", label: "lag-7 - LAG-IX.BA", index: "83886087" },
  { host: "sw-telxius1", rx: "86966", tx: "87034", label: "lag-8 - LAG-IXBR-TELXIUSI", index: "83886088" },
  { host: "sw-telxius1", rx: "86969", tx: "87037", label: "lag-11 - LAG-TRANSITOS-VOANET", index: "83886091" },
  { host: "sw-fsa1", rx: "92823", tx: "92893", label: "lag-9 - LAG-IX.FEC", index: "83886089" },
  { host: "sw-riachao", rx: "82898", tx: "82930", label: "lag-4 - LAG-UNIR-IX", index: "83886084" },
  { host: "sw-montegordo", rx: "76992", tx: "77002", label: "lag-1 - LAG-TDANET-IX", index: "83886081" },
  { host: "sw-aracaju", rx: "80006", tx: "80030", label: "lag-1 - LAG-IX.AJU", index: "83886081" },
] as const;

export function planConfirmedInternet(ports: TrafficPort[], existing: TrafficSelection[]): TrafficSelection[] {
  const external: TrafficSelection[] = CONFIRMED_INTERNET.map(c => {
    const matches = ports.filter(p => p.host === c.host && p.rx.itemid === c.rx && p.tx.itemid === c.tx && p.label === c.label && p.rx.key_ === `net.if.in[ifHCInOctets.${c.index}]` && p.tx.key_ === `net.if.out[ifHCOutOctets.${c.index}]`);
    const port = matches[0];
    if (matches.length !== 1 || !port) throw new Error(`Porta confirmada ausente ou alterada: ${c.host} ${c.label}. Nada foi aplicado.`);
    return { portId: port.id, group: "external" };
  });
  const clients = existing.filter(s => s.group === "clients");
  if (clients.some(s => external.some(e => e.portId === s.portId))) throw new Error("Uma porta confirmada está no grupo Clientes. Revise a classificação antes de aplicar.");
  return [...clients, ...external];
}