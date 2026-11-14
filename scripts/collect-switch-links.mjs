// Read-only diagnostic, run inside the existing container with node --input-type=module.
const { ZABBIX_URL: base, ZABBIX_USER: username, ZABBIX_PASSWORD: password } = process.env;
if (!base || !username || !password) throw new Error('Zabbix não configurado no container');
const url = base.replace(/\/+$/, '') + '/api_jsonrpc.php';
let token;
async function rpc(method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json-rpc', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Zabbix HTTP ${response.status}`);
  const data = await response.json();
  if (data.error) throw new Error(`Consulta ${method} recusada; confira a permissão de leitura no Zabbix`);
  return data.result;
}
try {
  token = await rpc('user.login', { username, password });
  const hosts = await rpc('host.get', { output: ['hostid', 'host'], search: { host: 'sw-' }, startSearch: true });
  const selected = hosts.filter((h) => ['swolindina', 'swmontegordo'].includes(h.host.toLowerCase().replace(/[^a-z0-9]/g, '')));
  if (selected.length !== 2) throw new Error('Não foi possível encontrar exatamente os dois switches; confira os nomes técnicos');
  const interfaces = await rpc('item.get', {
    output: ['itemid', 'name', 'key_', 'lastvalue', 'lastclock', 'status', 'state'],
    hostids: selected.map((h) => h.hostid), selectHosts: ['host'],
    search: { key_: ['net.if.status', 'ifOperStatus', 'ifAlias', 'ifName', 'net.if.alias', 'net.if.name'] }, searchByAny: true,
  });
  // Do not export arbitrary item values: only operational states and interface labels are relevant.
  const safeInterfaces = interfaces.filter((i) => /net\.if\.(status|alias|name)\[|ifOperStatus|ifAlias|ifName/i.test(i.key_));
  const fs = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const dbPath = process.env.DATABASE_PATH || '/data/mapa.db';
  let network = null;
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    network = { pops: db.prepare('SELECT id,name,city FROM pops').all(), links: db.prepare('SELECT * FROM links').all() };
    db.close();
  }
  console.log(JSON.stringify({ collectedAt: new Date().toISOString(), hosts: selected, interfaces: safeInterfaces, network }, null, 2));
} finally {
  if (token) await rpc('user.logout', {}).catch(() => {});
}