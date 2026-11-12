import type { InterfaceItem, LinkStatus } from "./link-status";
import type { Link } from "./network.types";

export const PADTEC_MONITOR_HOST = "Padtec - Servidor";
export const opticalLossKey = /^cardPart\d+_alarmLossLine[12]\.\[\d+\]$/;

/** Alarm polarity is an explicit, verified configuration, never inferred from traffic or host alarms. */
export function opticalStatus(item: InterfaceItem | undefined, link: Link, now = Date.now()): LinkStatus {
  if (link.zabbix_host !== PADTEC_MONITOR_HOST || !item?.hosts.some((h) => h.host === PADTEC_MONITOR_HOST) || !opticalLossKey.test(item.key_))
    return { state: "unknown", message: "Selecione um alarme óptico Loss da Line no host Padtec - Servidor" };
  if (link.optical_down_value !== "0" && link.optical_down_value !== "1")
    return { state: "unknown", message: "Significado do alarme óptico ainda não confirmado" };
  const clock = Number(item.lastclock);
  if (item.status !== "0" || item.state !== "0" || !Number.isFinite(clock) || clock <= 0 || clock > now / 1000 || now / 1000 - clock > 300)
    return { state: "unknown", message: "Alarme óptico sem leitura válida nos últimos 5 minutos" };
  if (item.lastvalue !== "0" && item.lastvalue !== "1")
    return { state: "unknown", message: "Valor do alarme óptico inconclusivo" };
  return item.lastvalue === link.optical_down_value
    ? { state: "down", message: "Perda de sinal óptico na Line cadastrada" }
    : { state: "up", message: "Sem alarme de perda de sinal na Line cadastrada (não confirma tráfego)" };
}