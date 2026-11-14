import type { Link, Pop } from "./network.types";

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
  byName?: Record<string, { state: string; problems: { name: string; severity: number }[] }>;
}, endpoints?: { from?: Pick<Pop, "name"> | undefined; to?: Pick<Pop, "name"> | undefined }): "up" | "down" | "unknown" | "unmonitored" | "suspect" {
  if (!link.zabbix_item.trim()) {
    const names = [endpoints?.from?.name, endpoints?.to?.name];
    const bothCritical = z?.enabled && !z.error && names.every((name) => {
      if (!name?.startsWith("padtec-")) return false;
      const status = z.byName?.[name];
      return status?.state === "down" && status.problems.some((p) => p.severity >= 4);
    });
    return bothCritical ? "suspect" : "unmonitored";
  }
  if (!z?.enabled || z.error) return "unknown";
  return z.byLink?.[String(link.id)]?.state ?? "unknown";
}