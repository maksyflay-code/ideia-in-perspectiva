// Read-only Zabbix client. Credentials come from ZABBIX_URL / ZABBIX_USER / ZABBIX_PASSWORD.
export type PopStatus = {
  state: "ok" | "warn" | "down" | "unknown";
  problems: { name: string; severity: number }[];
};
export type ZabbixStatus = { enabled: boolean; error?: string; byName: Record<string, PopStatus> };

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

export async function getStatus(names: string[]): Promise<ZabbixStatus> {
  const c = cfg();
  if (!c) return { enabled: false, byName: {} };
  const key = [...names].sort().join("|");
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
    const value = { enabled: true, byName };
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
