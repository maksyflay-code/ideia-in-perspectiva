import type { Db } from './db.server';

export const SWITCH_SEGMENTS = [
  { from: 'sw-olindina', to: 'sw-novasoure', item: '78335' },
  { from: 'sw-olindina', to: 'sw-alagoinhas', item: '78336' },
  { from: 'sw-montegordo', to: 'sw-telxius1', item: '77008' }, // via CETREL
  { from: 'sw-montegordo', to: 'sw-telxius1', item: '77009' }, // via Guarajuba
] as const;

export function importOlindinaMontegordo(d: Db) {
  d.exec('BEGIN IMMEDIATE');
  try {
    const pops = d.prepare('SELECT id,name FROM pops').all() as { id: number; name: string }[];
    const plan = SWITCH_SEGMENTS.map(s => {
      const a = pops.filter(p => p.name === s.from);
      const b = pops.filter(p => p.name === s.to);
      const from = a[0], to = b[0];
      if (a.length !== 1 || b.length !== 1 || !from || !to)
        throw new Error(`Nenhuma ligação criada: ${s.from} ↔ ${s.to} exige exatamente um POP em cada ponta.`);
      return { ...s, x: from.id, y: to.id };
    });
    let added = 0, existed = 0, monitored = 0, preserved = 0;
    for (const s of plan) {
      const matches = d.prepare('SELECT id,zabbix_host,zabbix_item FROM links WHERE (from_pop=? AND to_pop=?) OR (from_pop=? AND to_pop=?)').all(s.x, s.y, s.y, s.x) as { id: number; zabbix_host: string; zabbix_item: string }[];
      if (matches.some(l => l.zabbix_host === s.from && l.zabbix_item === s.item)) { existed++; continue; }
      const blank = matches.find(l => !l.zabbix_item.trim());
      if (blank) {
        d.prepare("UPDATE links SET zabbix_host=?,zabbix_item=?,monitor_kind='interface',optical_down_value='' WHERE id=?").run(s.from, s.item, blank.id);
        monitored++;
      } else if (matches.length && s.from !== 'sw-montegordo') {
        preserved++;
      } else {
        d.prepare("INSERT INTO links(from_pop,to_pop,distance_km,zabbix_host,zabbix_item,monitor_kind,optical_down_value) VALUES(?,?,0,?,?,'interface','')").run(s.x, s.y, s.from, s.item);
        added++;
      }
    }
    d.exec('COMMIT');
    return { added, existed, monitored, preserved };
  } catch (e) { d.exec('ROLLBACK'); throw e; }
}