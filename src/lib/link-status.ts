import type { Link, Pop } from "./network.types";

export type LinkStatus = { state: "up" | "down" | "unknown" | "degraded"; message: string };
export type InterfaceItem = {
  itemid: string; key_: string; lastvalue: string; lastclock: string;
  status: string; state: string; hosts: { host: string }[];
};

/** Only operational-interface status can establish a link failure; host alarms cannot. */
export function interfaceStatus(item: InterfaceItem | undefined, host: string, now = Date.now()): LinkStatus {
  if (!item || !item.hosts.some((h) => h.host === host))
    return { state: "unknown", message: "Item não encontrado neste host" };
  if (!/net\.if\.status\[|ifOperStatus|mgmtOsc\.operStatus/i.test(item.key_))
    return { state: "unknown", message: "Selecione um item de estado operacional da porta (ifOperStatus)" };
  if (item.status !== "0" || item.state !== "0" || Number(item.lastclock) <= 0 || now / 1000 - Number(item.lastclock) > 300)
    return { state: "unknown", message: "Porta sem leitura válida nos últimos 5 minutos" };
  if (item.lastvalue === "1") return { state: "up", message: "Porta ativa" };
  if (item.lastvalue === "2") return { state: "down", message: "Porta caída" };
  return { state: "unknown", message: "Estado da porta inconclusivo" };
}

/** Group of ports on one switch (e.g. LAG members): any confirmed down port fails the link. */
export function interfaceGroupIds(value: string) {
  const ids = value.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length >= 2 && ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}
export function interfaceGroupStatus(items: (InterfaceItem | undefined)[], host: string, now = Date.now()): LinkStatus {
  const st = items.map((i) => interfaceStatus(i, host, now));
  const down = st.filter((x) => x.state === "down").length;
  if (down) return { state: "down", message: `${down} de ${st.length} portas caídas` };
  if (st.some((x) => x.state !== "up")) return { state: "unknown", message: "Alguma porta sem leitura válida" };
  return { state: "up", message: `Todas as ${st.length} portas ativas` };
}

export function linkVisualState(link: Link, z?: {
  enabled: boolean; error?: string; byLink?: Record<string, LinkStatus>;
  byName?: Record<string, { state: string; problems: { name: string; severity: number }[] }>;
}, endpoints?: { from?: Pick<Pop, "name"> | undefined; to?: Pick<Pop, "name"> | undefined }): "up" | "down" | "unknown" | "degraded" | "unmonitored" | "suspect" {
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
/** Padtec SPVL (supervisory/OSC) "SFP down alarm": 0 = no alarm, 1 = alarm. Any fresh alarm fails the span. */
export const spvlSfpDownKey = /^cardPart\d+_.*sfp.*down.*\[\d+\]$/i;
export function spvlStatus(items: (InterfaceItem | undefined)[], now = Date.now()): LinkStatus {
  if (!items.length) return { state: "unknown", message: "Nenhum alarme de supervisão cadastrado" };
  let unknown = false;
  for (const i of items) {
    if (!i || !i.hosts.some((h) => h.host === "Padtec - Servidor") || !spvlSfpDownKey.test(i.key_)) { unknown = true; continue; }
    if (i.status !== "0" || i.state !== "0" || Number(i.lastclock) <= 0 || now / 1000 - Number(i.lastclock) > 300) { unknown = true; continue; }
    if (i.lastvalue === "1") return { state: "down", message: "Canal de supervisão Padtec caído (provável fibra rompida)" };
    if (i.lastvalue !== "0") unknown = true;
  }
  return unknown ? { state: "unknown", message: "Supervisão Padtec sem leitura válida" } : { state: "up", message: "Canal de supervisão Padtec ativo" };
}
