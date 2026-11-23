import type { InterfaceItem, LinkStatus } from "./link-status";

export const OLP_KIND = "olp_power" as const;
/** zabbix_item holds four item ids: input L1, threshold L1, input L2, threshold L2 (same host). */
export function olpItemIds(value: string) {
  const ids = value.split(",").map((s) => s.trim());
  return ids.length === 4 && ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}

/** Red when either protected route loses light: both routes matter, so any break is a failure. */
export function olpStatus(items: (InterfaceItem | undefined)[], host: string, now = Date.now()): LinkStatus {
  const values = items.map((i) => {
    if (!i || !i.hosts.some((h) => h.host === host) || i.status !== "0" || i.state !== "0") return null;
    if (Number(i.lastclock) <= 0 || now / 1000 - Number(i.lastclock) > 300) return null;
    const n = Number(i.lastvalue);
    return Number.isFinite(n) ? n : null;
  });
  if (values.length !== 4 || values.some((v) => v === null)) return { state: "unknown", message: "Proteção óptica sem leitura válida nos últimos 5 minutos" };
  const [in1, th1, in2, th2] = values as number[];
  const lost1 = in1! < th1!, lost2 = in2! < th2!;
  if (lost1 && lost2) return { state: "down", message: "As duas rotas da proteção sem luz" };
  if (lost1) return { state: "down", message: "Rota da Line 1 sem luz · tráfego pela Line 2" };
  if (lost2) return { state: "down", message: "Rota da Line 2 sem luz · tráfego pela Line 1" };
  return { state: "up", message: "As duas rotas da proteção com luz" };
}
