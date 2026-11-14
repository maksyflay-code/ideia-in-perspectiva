// Read-only Zabbix client. Credentials come from ZABBIX_URL / ZABBIX_USER / ZABBIX_PASSWORD.
import type { Link } from "@/lib/network.types";
import { interfaceStatus, type InterfaceItem, type LinkStatus } from "@/lib/link-status";
import { opticalStatus, opticalLossKey } from "@/lib/optical-status";
import type { DiscoveryItem, DwdmKind } from "@/lib/dwdm-discovery";
export type PopStatus = {
  state: "ok" | "warn" | "down" | "unknown";
  problems: { name: string; severity: number }[];
};
export type ZabbixStatus = { enabled: boolean; error?: string; byName: Record<string, PopStatus>; byLink?: Record<string, LinkStatus> };

let token: string | null = null;
let cache: { at: number; key: string; value: ZabbixStatus } | null = null;

function cfg() {
  const url = (process.env["ZABBIX_URL"] || "").replace(/\/+$/, "");
  const user = process.env["ZABBIX_USER"] || "";
  const password = process.env["ZABBIX_PASSWORD"] || "";
  return url && user && password ? { url: `${url}/api_jsonrpc.php`, user, password } : null;
}

async function rpc(url: string, method: string, params: unknown, auth?: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json-rpc", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Zabbix HTTP ${res.status}`);
  const j = (await res.json()) as { result?: unknown; error?: { data?: string; message?: string } };
  if (j.error) throw new Error(j.error.data || j.error.message || "Erro Zabbix");
  return j.result;
}

async function call(c: NonNullable<ReturnType<typeof cfg>>, method: string, params: unknown) {
  if (!token) token = (await rpc(c.url, "user.login", { username: c.user, password: c.password })) as string;
  try {
    return await rpc(c.url, method, params, token);
  } catch (e) {
    if (/session|re-login|not authori[sz]ed/i.test(String(e))) {
      token = (await rpc(c.url, "user.login", { username: c.user, password: c.password })) as string;
      return rpc(c.url, method, params, token);
    }
    throw e;
  }
}

export async function getStatus(names: string[], links: Link[] = []): Promise<ZabbixStatus> {
  const c = cfg();
  if (!c) return { enabled: false, byName: {} };
  const key = JSON.stringify([[...names].sort(), links.map((l) => [l.id, l.zabbix_host, l.zabbix_item, l.monitor_kind, l.optical_down_value])]);
  if (cache && cache.key === key && Date.now() - cache.at < 30000) return cache.value;
  try {
    const hosts = (await call(c, "host.get", {
      output: ["hostid", "host"],
      filter: { host: names },
    })) as { hostid: string; host: string }[];
    const byName: Record<string, PopStatus> = {};
    for (const n of names) byName[n] = { state: "unknown", problems: [] };
    const hostName = new Map(hosts.map((h) => [h.hostid, h.host]));
    for (const h of hosts) byName[h.host] = { state: "ok", problems: [] };
    if (hosts.length) {
      const triggers = (await call(c, "trigger.get", {
        output: ["description", "priority"],
        hostids: hosts.map((h) => h.hostid),
        filter: { value: 1 },
        monitored: true,
        skipDependent: true,
        expandDescription: true,
        selectHosts: ["hostid"],
      })) as { description: string; priority: string; hosts: { hostid: string }[] }[];
      for (const t of triggers) {
        const sev = Number(t.priority);
        for (const h of t.hosts) {
          const n = hostName.get(h.hostid);
          if (!n || !byName[n]) continue;
          const s = byName[n];
          s.problems.push({ name: t.description, severity: sev });
          if (sev >= 4) s.state = "down";
          else if (sev >= 2 && s.state !== "down") s.state = "warn";
        }
      }
      for (const s of Object.values(byName)) s.problems.sort((a, b) => b.severity - a.severity);
    }
    if (names.some((n) => n.startsWith(PADTEC_PREFIX))) {
      const padtec = await padtecTriggers(c, true);
      for (const n of names) if (n.startsWith(PADTEC_PREFIX)) byName[n] = { state: padtec.found ? "ok" : "unknown", problems: [] };
      for (const t of padtec.triggers) {
        const s = byName[t.pop];
        if (!s) continue;
        s.problems.push({ name: t.description, severity: t.severity });
        if (t.severity >= 4) s.state = "down";
        else if (t.severity >= 2 && s.state !== "down") s.state = "warn";
      }
      for (const n of names) byName[n]?.problems.sort((a, b) => b.severity - a.severity);
    }
    const byLink: Record<string, LinkStatus> = {};
    const monitored = links.filter((l) => l.zabbix_item.trim());
    if (monitored.length) {
      try {
        const items = (await call(c, "item.get", {
          output: ["itemid", "key_", "lastvalue", "lastclock", "status", "state"],
          itemids: [...new Set(monitored.map((l) => l.zabbix_item.trim()))],
          selectHosts: ["host"],
        })) as InterfaceItem[];
        const byId = new Map(items.map((i) => [i.itemid, i]));
        for (const l of monitored) {
          if (l.monitor_kind !== "padtec_loss") {
            byLink[String(l.id)] = interfaceStatus(byId.get(l.zabbix_item.trim()), l.zabbix_host.trim());
            continue;
          }
          byLink[String(l.id)] = opticalStatus(byId.get(l.zabbix_item.trim()), l);
        }
      } catch {
        for (const l of monitored) byLink[String(l.id)] = { state: "unknown", message: "Não foi possível consultar a porta no Zabbix" };
      }
    }
    const value = { enabled: true, byName, byLink };
    cache = { at: Date.now(), key, value };
    return value;
  } catch (e) {
    token = null;
    return { enabled: true, error: e instanceof Error ? e.message : String(e), byName: {} };
  }
}

export async function listHosts(prefix: string) {
  const c = cfg();
  if (!c) throw new Error("Zabbix não configurado (ZABBIX_URL/ZABBIX_USER/ZABBIX_PASSWORD)");
  const hosts = (await call(c, "host.get", {
    output: ["host"],
    selectInventory: ["location_lat", "location_lon"],
    ...(prefix ? { search: { host: prefix }, startSearch: true } : {}),
  })) as { host: string; inventory: { location_lat?: string; location_lon?: string } | [] }[];
  return hosts.map((h) => {
    const inv = Array.isArray(h.inventory) ? {} : h.inventory;
    const lat = Number(inv.location_lat);
    const lng = Number(inv.location_lon);
    return { host: h.host, lat: inv.location_lat && !isNaN(lat) ? lat : null, lng: inv.location_lon && !isNaN(lng) ? lng : null };
  });
}

// Padtec nodes are not separate Zabbix hosts: all alarms live on one host and are
// written as "POP: <NOME> - ...". Each site maps to a POP named padtec-<slug>.
export const PADTEC_HOST = "Padtec - Servidor";
export const PADTEC_PREFIX = "padtec-";

export function padtecSlug(site: string) {
  return (
    PADTEC_PREFIX +
    site
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

export function padtecSite(description: string) {
  const m = /^POP:\s*(.+?)\s+-\s/.exec(description);
  return m ? m[1]!.trim() : null;
}

async function padtecTriggers(c: NonNullable<ReturnType<typeof cfg>>, onlyActive: boolean) {
  const hosts = (await call(c, "host.get", { output: ["hostid"], filter: { host: [PADTEC_HOST] } })) as { hostid: string }[];
  if (!hosts.length) return { found: false, triggers: [] as { pop: string; site: string; description: string; severity: number }[] };
  const list = (await call(c, "trigger.get", {
    output: ["description", "priority"],
    hostids: [hosts[0]!.hostid],
    ...(onlyActive ? { filter: { value: 1 }, monitored: true, skipDependent: true } : {}),
    expandDescription: true,
  })) as { description: string; priority: string }[];
  const triggers = [];
  for (const t of list) {
    const site = padtecSite(t.description);
    if (site) triggers.push({ pop: padtecSlug(site), site, description: t.description, severity: Number(t.priority) });
  }
  return { found: true, triggers };
}

export async function listPadtecSites() {
  const c = cfg();
  if (!c) throw new Error("Zabbix não configurado (ZABBIX_URL/ZABBIX_USER/ZABBIX_PASSWORD)");
  const r = await padtecTriggers(c, false);
  if (!r.found) throw new Error(`Host "${PADTEC_HOST}" não encontrado no Zabbix`);
  const sites = new Map<string, string>();
  for (const t of r.triggers) sites.set(t.pop, t.site);
  return [...sites].map(([host, site]) => ({ host, site }));
}

export type OpticalItem = InterfaceItem & { name: string; valuemap: { mappings?: { value: string; newvalue: string }[] } };
export async function listOpticalItems(): Promise<OpticalItem[]> {
  const c = cfg();
  if (!c) throw new Error("Zabbix não configurado na VM");
  const hosts = (await call(c, "host.get", { output: ["hostid"], filter: { host: [PADTEC_HOST] } })) as { hostid: string }[];
  const host = hosts[0];
  if (!host) throw new Error("Host Padtec - Servidor não encontrado");
  const items = (await call(c, "item.get", {
    output: ["itemid", "name", "key_", "lastvalue", "lastclock", "status", "state"],
    hostids: [host.hostid], selectHosts: ["host"], selectValueMap: "extend",
    search: { key_: "alarmLossLine" },
  })) as OpticalItem[];
  return items.filter((i) => opticalLossKey.test(i.key_)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listDwdmItems(kind: DwdmKind): Promise<DiscoveryItem[]> {
  const c = cfg();
  if (!c) throw new Error("Zabbix não configurado na VM");
  const hosts = await call(c, "host.get", {
    output: ["hostid", "host"],
    ...(kind === "padtec" ? { filter: { host: [PADTEC_HOST] } } : { search: { host: "eci-" }, startSearch: true }),
  }) as { hostid: string; host: string }[];
  const selected = hosts.filter((h) => kind === "padtec" ? h.host === PADTEC_HOST : h.host.startsWith("eci-"));
  if (!selected.length) throw new Error("Nenhum equipamento deste tipo encontrado no Zabbix");
  return await call(c, "item.get", {
    output: ["itemid", "name", "key_"], hostids: selected.map((h) => h.hostid), selectHosts: ["host"],
  }) as DiscoveryItem[];
}
