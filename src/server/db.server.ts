// SQLite storage using Node's built-in node:sqlite (no native deps, works in Docker on Node 22+).
// The module name is held in a variable so bundlers never try to resolve it statically.
type Stmt = {
  all: (...a: unknown[]) => unknown[];
  get: (...a: unknown[]) => unknown;
  run: (...a: unknown[]) => { lastInsertRowid: number | bigint; changes: number | bigint };
};
export type Db = { exec: (sql: string) => void; prepare: (sql: string) => Stmt };

let dbPromise: Promise<Db> | undefined;

export function getDb(): Promise<Db> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open(): Promise<Db> {
  const modName = "node:sqlite";
  const { DatabaseSync } = (await import(/* @vite-ignore */ modName)) as {
    DatabaseSync: new (path: string) => Db;
  };
  const fs = (await import(/* @vite-ignore */ "node:fs")) as typeof import("node:fs");
  const path = process.env["DATABASE_PATH"] || "./data/mapa.db";
  const dir = path.substring(0, path.lastIndexOf("/"));
  if (dir) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_pop INTEGER NOT NULL REFERENCES pops(id) ON DELETE CASCADE,
      to_pop INTEGER NOT NULL REFERENCES pops(id) ON DELETE CASCADE,
      distance_km REAL NOT NULL DEFAULT 0,
      zabbix_host TEXT NOT NULL DEFAULT '',
      zabbix_item TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      primary_path TEXT NOT NULL DEFAULT '[]',
      secondary_path TEXT NOT NULL DEFAULT '[]'
    );
  `);
  const count = (db.prepare("SELECT COUNT(*) AS n FROM pops").get() as { n: number }).n;
  if (count === 0 && process.env["SEED_DEMO"] !== "0") seed(db);
  return db;
}

// Demo data (fictional) so the map is not empty on first run. Disable with SEED_DEMO=0.
function seed(db: Db) {
  const pops: [string, string, number, number][] = [
    ["POP-SSA-01", "Salvador", -12.9714, -38.5014],
    ["POP-FSA-01", "Feira de Santana", -12.2664, -38.9663],
    ["POP-VDC-01", "Vitória da Conquista", -14.8615, -40.8442],
    ["POP-ITB-01", "Itabuna", -14.7876, -39.2781],
    ["POP-JZR-01", "Juazeiro", -9.4167, -40.5033],
  ];
  const ins = db.prepare("INSERT INTO pops (name, city, lat, lng) VALUES (?, ?, ?, ?)");
  for (const p of pops) ins.run(...p);
  const link = db.prepare("INSERT INTO links (from_pop, to_pop, distance_km) VALUES (?, ?, ?)");
  link.run(1, 2, 108);
  link.run(2, 3, 380);
  link.run(1, 4, 430);
  link.run(4, 3, 190);
  link.run(2, 5, 410);
  db.prepare("INSERT INTO channels (name, primary_path, secondary_path) VALUES (?, ?, ?)").run(
    "CH-01 SSA-VDC",
    "[1,2,3]",
    "[1,4,3]",
  );
}
