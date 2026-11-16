export type PingItem = { key_: string; lastvalue: string; lastclock: string; status: string; state: string };

/** Ping loss only when a fresh, supported Zabbix icmpping reading is 0; stale or missing data is not a failure. */
export function pingLost(item: PingItem | undefined, now = Date.now()): boolean {
  if (!item || !/^icmpping(\[|$)/.test(item.key_)) return false;
  if (item.status !== "0" || item.state !== "0") return false;
  const age = now / 1000 - Number(item.lastclock);
  if (!(Number(item.lastclock) > 0) || age > 300) return false;
  return item.lastvalue === "0";
}
