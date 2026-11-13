type S = { state: string; problems: { description: string }[] };
/** Parks has no Zabbix host: its marker follows the switch at the same site (parks-x → sw-x),
 *  keeping only that switch's OSC-PARKS alarms. */
export function parksStatus<T extends S>(byName: Record<string, T>, names: string[]): Record<string, T> {
  const out = { ...byName };
  for (const n of names) {
    if (!/^parks-/i.test(n)) continue;
    const sw = byName[n.replace(/^parks-/i, "sw-")];
    if (!sw) continue;
    const problems = sw.problems.filter((p) => /parks/i.test(p.description));
    out[n] = { ...sw, problems, state: sw.state === "unknown" ? "unknown" : problems.length ? sw.state : "ok" } as T;
  }
  return out;
}
