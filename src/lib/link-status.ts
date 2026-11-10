import type { Link } from "./network.types";

export type LinkStatus = { state: "up" | "down" | "unknown"; message: string };
export type InterfaceItem = {
  itemid: string; key_: string; lastvalue: string; lastclock: string;
  status: string; state: string; hosts: { host: string }[];
};

/** Only operational-interface status can establish a link failure; host alarms cannot. */
export function interfaceStatus(item: InterfaceItem | undefined, host: string, now = Date.now()): LinkStatus {
  if (!item || !item.hosts.some((h) => h.host === host))
    return { state: "unknown", message: "Item não encontrado neste host" };
  if (!/net\.if\.status\[|ifOperStatus/i.test(item.key_))
    return { state: "unknown", message: "Selecione um item de estado operacional da porta (ifOperStatus)" };
  if (item.status !== "0" || item.state !== "0" || Number(item.lastclock) <= 0 || now / 1000 - Number(item.lastclock) > 300)
    return { state: "unknown", message: "Porta sem leitura válida nos últimos 5 minutos" };
  if (item.lastvalue === "1") return { state: "up", message: "Porta ativa" };
  if (item.lastvalue === "2") return { state: "down", message: "Porta caída" };
  return { state: "unknown", message: "Estado da porta inconclusivo" };
}

export function linkVisualState(link: Link, z?: {
  enabled: boolean; error?: string; byLink?: Record<string, LinkStatus>;
}): "up" | "down" | "unknown" | "unmonitored" {
  if (!link.zabbix_item.trim()) return "unmonitored";
  if (!z?.enabled || z.error) return "unknown";
  return z.byLink?.[String(link.id)]?.state ?? "unknown";
}