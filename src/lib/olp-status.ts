import type { InterfaceItem, LinkStatus } from "./link-status";

export const OLP_KIND = "olp_power" as const;
/** zabbix_item holds four item ids: input L1, threshold L1, input L2, threshold L2 (same host). */
export function olpItemIds(value: string) {
  const ids = value.split(",").map((s) => s.trim());
  return ids.length === 4 && ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}

export const OLP_ROUTE_KIND = "olp_route" as const;
/** One protected route as its own link: zabbix_item holds "input,threshold" item ids. */
export function olpRouteItemIds(value: string) {
  const ids = value.split(",").map((s) => s.trim());
  return ids.length === 2 && ids.every((id) => /^\d+$/.test(id)) ? ids : null;
}
export function olpRouteStatus(items: (InterfaceItem | undefined)[], host: string, now = Date.now()): LinkStatus {
  const v = items.map((i) => {
    if (!i || !i.hosts.some((h) => h.host === host) || i.status !== "0" || i.state !== "0") return null;
    if (Number(i.lastclock) <= 0 || now / 1000 - Number(i.lastclock) > 300) return null;
    const n = Number(i.lastvalue);
    return Number.isFinite(n) ? n : null;
  });
  if (v.length !== 2 || v.some((x) => x === null)) return { state: "unknown", message: "Rota sem leitura válida nos últimos 5 minutos" };
  return v[0]! < v[1]! ? { state: "down", message: "Rota sem luz (abaixo do limite)" } : { state: "up", message: "Rota com luz" };
}

/** Red only when both protected routes lose light; one route lost is a degraded (yellow) link. */
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
  if (lost1) return { state: "degraded", message: "Rota da Line 1 sem luz · tráfego pela Line 2" };
  if (lost2) return { state: "degraded", message: "Rota da Line 2 sem luz · tráfego pela Line 1" };
  return { state: "up", message: "As duas rotas da proteção com luz" };
}
