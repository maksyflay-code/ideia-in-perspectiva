import type { InterfaceItem, LinkStatus } from "./link-status";
import type { Link } from "./network.types";

export const PADTEC_MONITOR_HOST = "Padtec - Servidor";
export const opticalLossKey = /^cardPart\d+_alarmLossLine[12]\.\[\d+\]$/;

export function opticalLineKeys(lossKey: string): string[] {
  if (!opticalLossKey.test(lossKey)) return [];
  return [lossKey, lossKey.replace("alarmLossLine", "alarmLossSyncLine"), lossKey.replace("alarmLossLine", "alarmLosfOtu")];
}

export const SANTA_LUZIA_PAF_ALARMS = [
  { item: "176366", key: "cardPart2702_alarmLossLine1.[1302]" },
  { item: "176790", key: "cardPart2702_alarmLossLine1.[1312]" },
];

type LineItem = InterfaceItem & { valuemap?: { mappings?: { value: string; newvalue: string }[] } };
/** Only the same card and Line participate; siblings must explicitly confirm binary alarm polarity. */
export function opticalLineStatus(items: LineItem[], lossKey: string, link: Link, now = Date.now()): LinkStatus {
  if (link.optical_down_value !== "0" && link.optical_down_value !== "1")
    return { state: "unknown", message: "Significado do alarme óptico ainda não confirmado" };
  const keys = opticalLineKeys(lossKey);
  if (!keys.length) return { state: "unknown", message: "Line Padtec não identificada" };
  const readings = keys.map((key, index): LinkStatus => {
    const matches = items.filter((i) => i.key_ === key && i.hosts.some((h) => h.host === PADTEC_MONITOR_HOST));
    const item = matches.length === 1 ? matches[0] : undefined;
    if (!item) return { state: "unknown", message: "Line sem todos os alarmes Loss, Sync e LOF disponíveis" };
    let polarity = link.optical_down_value;
    if (index > 0) {
      const mappings = item.valuemap?.mappings ?? [];
      const active = mappings.filter((m) => /^(active alarm|alarme ativo)$/i.test(m.newvalue));
      const inactive = mappings.filter((m) => /^(no alarm|sem alarme)$/i.test(m.newvalue));
      if (active.length !== 1 || inactive.length !== 1 || active[0]?.value === inactive[0]?.value || !["0", "1"].includes(inactive[0]?.value ?? ""))
        return { state: "unknown", message: "Polaridade Sync/LOF não confirmada no Zabbix" };
      polarity = active[0]?.value;
    }
    // Reuse strict freshness and host checks after matching the sibling to this exact Line.
    const status = opticalStatus({ ...item, key_: lossKey }, { ...link, optical_down_value: polarity ?? "" }, now);
    return status.state === "down" ? { state: "down", message: ["Perda de sinal na Line", "Perda de sincronismo na Line", "Perda de enquadramento (LOF) na Line"][index] ?? "Alarme da Line" } : status;
  });
  const down = readings.find((r) => r.state === "down");
  if (down) return down;
  return readings.find((r) => r.state === "unknown") ?? { state: "up", message: "Line sem alarmes Loss, Sync ou LOF (não confirma tráfego)" };
}

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