import { describe, expect, it } from 'vitest';
import { importOlindinaMontegordo } from '@/server/olindina-montegordo.server';
import type { Db } from '@/server/db.server';

async function database() {
  const moduleName = 'node:sqlite';
  const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as typeof import('node:sqlite');
  const d = new DatabaseSync(':memory:');
  d.exec("CREATE TABLE pops(id INTEGER,name TEXT); CREATE TABLE links(id INTEGER PRIMARY KEY,from_pop INTEGER,to_pop INTEGER,distance_km REAL,zabbix_host TEXT,zabbix_item TEXT,monitor_kind TEXT,optical_down_value TEXT); INSERT INTO pops VALUES(1,'sw-olindina'),(2,'sw-novasoure'),(3,'sw-alagoinhas'),(4,'sw-montegordo'),(5,'sw-telxius1');");
  return d;
}
describe('Olindina and Monte Gordo confirmed ports', () => {
  it('persists Olindina to Nova Soure on 78335 and Alagoinhas on 78336', async () => {
    const d = await database(); importOlindinaMontegordo(d as Db);
    expect(d.prepare('SELECT from_pop,to_pop,zabbix_item FROM links WHERE zabbix_host=? ORDER BY zabbix_item').all('sw-olindina')).toEqual([
      { from_pop: 1, to_pop: 2, zabbix_item: '78335' }, { from_pop: 1, to_pop: 3, zabbix_item: '78336' },
    ]); d.close();
  });
  it('keeps two independently monitored Monte Gordo–Telxius1 circuits and is repeatable', async () => {
    const d = await database();
    expect(importOlindinaMontegordo(d as Db).added).toBe(4);
    expect(d.prepare('SELECT from_pop,to_pop,zabbix_item FROM links WHERE zabbix_host=? ORDER BY zabbix_item').all('sw-montegordo')).toEqual([
      { from_pop: 4, to_pop: 5, zabbix_item: '77008' }, { from_pop: 4, to_pop: 5, zabbix_item: '77009' },
    ]);
    expect(importOlindinaMontegordo(d as Db)).toEqual({ added: 0, existed: 4, monitored: 0, preserved: 0 });
    expect(d.prepare('SELECT count(*) n FROM links').get()).toMatchObject({ n: 4 }); d.close();
  });
  it('fills an unmonitored reverse link without changing distance', async () => {
    const d = await database(); d.exec("INSERT INTO links VALUES(8,5,4,123,'','','interface','')");
    expect(importOlindinaMontegordo(d as Db).monitored).toBe(1);
    expect(d.prepare('SELECT * FROM links WHERE id=8').get()).toMatchObject({ distance_km: 123, zabbix_item: '77008' });
    expect(d.prepare('SELECT count(*) n FROM links WHERE from_pop=4 OR to_pop=4').get()).toMatchObject({ n: 2 }); d.close();
  });
  it('preserves other monitoring', async () => {
    const d = await database(); d.exec("INSERT INTO links VALUES(8,2,1,123,'other','999','interface','')");
    expect(importOlindinaMontegordo(d as Db).preserved).toBe(1);
    expect(d.prepare('SELECT * FROM links WHERE id=8').get()).toMatchObject({ zabbix_item: '999', zabbix_host: 'other' }); d.close();
  });
  it.each(['missing', 'ambiguous'])('rejects %s POP atomically', async kind => {
    const d = await database();
    d.exec(kind === 'missing' ? 'DELETE FROM pops WHERE id=5' : "INSERT INTO pops VALUES(6,'sw-telxius1')");
    expect(() => importOlindinaMontegordo(d as Db)).toThrow('exatamente um');
    expect(d.prepare('SELECT count(*) n FROM links').get()).toMatchObject({ n: 0 }); d.close();
  });
});