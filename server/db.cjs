const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
function openDatabase(dataDir) {
  const directory = path.resolve(dataDir);
  const publicDir = path.resolve(__dirname, '../dist');
  const relative = path.relative(publicDir, directory);
  if (!relative.startsWith('..') && !path.isAbsolute(relative))
    throw Error('Data directory must be outside dist');
  fs.mkdirSync(path.join(directory, 'pdf'), { recursive: true });
  const db = new Database(path.join(directory, 'okei.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const version = db.pragma('user_version', { simple: true });
  if (version > 3) {
    db.close();
    throw Error('Unsupported database version');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, name TEXT NOT NULL, group_name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','staff')));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), storage_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pages INTEGER NOT NULL CHECK(pages BETWEEN 1 AND 2000), size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 26214400));
    CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL REFERENCES users(id), file_id TEXT NOT NULL REFERENCES files(id), title TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('new','work','ready','issued','attention','review','cancelled')), total INTEGER NOT NULL CHECK(total>0), params TEXT NOT NULL CHECK(json_valid(params)), quote TEXT NOT NULL CHECK(json_valid(quote)), comment TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL, customer_group TEXT NOT NULL, created TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, payment TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment IN ('unpaid','paid')), paid_at TEXT, cancel_reason TEXT, resume_status TEXT, unread INTEGER NOT NULL DEFAULT 0 CHECK(unread>=0));
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, status TEXT NOT NULL, time TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, author TEXT NOT NULL CHECK(author IN ('user','staff')), text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000), time TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS order_owner ON orders(owner_id);
    CREATE INDEX IF NOT EXISTS event_order ON events(order_id,id);
    CREATE INDEX IF NOT EXISTS message_order ON messages(order_id,time);
    CREATE INDEX IF NOT EXISTS session_expiry ON sessions(expires);

  `);
  if (version < 2)
    db.transaction(() => {
      const columns = db.pragma('table_info(orders)').map((column) => column.name);
      if (!columns.includes('printing_started_at'))
        db.exec('ALTER TABLE orders ADD COLUMN printing_started_at TEXT');
      if (!columns.includes('cancelled_at'))
        db.exec('ALTER TABLE orders ADD COLUMN cancelled_at TEXT');
      db.exec(`
      CREATE TABLE IF NOT EXISTS order_files (
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL REFERENCES files(id), position INTEGER NOT NULL,
        params TEXT NOT NULL CHECK(json_valid(params)), quote TEXT NOT NULL CHECK(json_valid(quote)),
        PRIMARY KEY(order_id,file_id), UNIQUE(order_id,position)
      );
      CREATE INDEX IF NOT EXISTS attachment_file ON order_files(file_id);
      INSERT OR IGNORE INTO order_files SELECT id,file_id,0,params,quote FROM orders;
      UPDATE orders SET cancelled_at=(SELECT time FROM events WHERE order_id=orders.id AND status='cancelled' ORDER BY id DESC LIMIT 1) WHERE status='cancelled' AND cancelled_at IS NULL;
      PRAGMA user_version = 2;
    `);
    })();
  if (version < 3) {
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        db.exec(
          "ALTER TABLE files ADD COLUMN kind TEXT NOT NULL DEFAULT 'pdf' CHECK(kind IN ('pdf','design','preview','front','back'))",
        );
        db.exec(
          "ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'document' CHECK(kind IN ('document','merch'))",
        );
        db.exec(`
          CREATE TABLE files_v3 (
            id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
            storage_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
            pages INTEGER CHECK(pages IS NULL OR pages BETWEEN 1 AND 2000),
            size INTEGER NOT NULL CHECK(size BETWEEN 1 AND 26214400),
            kind TEXT NOT NULL DEFAULT 'pdf' CHECK(kind IN ('pdf','design','preview','front','back'))
          );
          INSERT INTO files_v3 SELECT id,owner_id,storage_name,name,pages,size,kind FROM files;
          DROP TABLE files;
          ALTER TABLE files_v3 RENAME TO files;
        `);
        db.exec('PRAGMA user_version=3;');
        if (db.pragma('foreign_key_check').length)
          throw Error('Database migration violates file ownership references');
      })();
    } catch (error) {
      db.close();
      throw error;
    } finally {
      if (db.open) db.pragma('foreign_keys = ON');
    }
  }
  return db;
}
module.exports = { openDatabase };
