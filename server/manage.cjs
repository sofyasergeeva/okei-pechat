const path = require('node:path');
const { openDatabase } = require('./db.cjs');
const { createUser } = require('./auth.cjs');
(async () => {
  const command = process.argv[2];
  if (command === 'backup' || command === 'restore') {
    const fs = require('node:fs');
    const { randomUUID } = require('node:crypto');
    const { createBackup, restoreBackup } = require('./backup.cjs');
    const data = process.env.DATA_DIR || path.join(__dirname, '../var/okei');
    if (command === 'backup') {
      const root = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '../var/backups'));
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      const name =
        'okei-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
      console.log('Backup created:', await createBackup(data, path.join(root, name)));
    } else {
      if (!process.argv[3])
        throw Error('Usage: npm run restore -- <backup-directory>; DATA_DIR must not exist');
      console.log('Restored:', await restoreBackup(process.argv[3], data));
    }
    return;
  }
  if (command !== 'staff') throw Error('Usage: node server/manage.cjs staff|backup|restore');
  if (!process.env.STAFF_LOGIN || !process.env.STAFF_PASSWORD)
    throw Error('Set STAFF_LOGIN and STAFF_PASSWORD in the private environment');
  const db = openDatabase(process.env.DATA_DIR || path.join(__dirname, '../var/okei'));
  try {
    await createUser(
      db,
      {
        login: process.env.STAFF_LOGIN,
        password: process.env.STAFF_PASSWORD,
        name: process.env.STAFF_NAME || 'Сотрудник',
        group: 'Типография',
      },
      'staff',
    );
    console.log('Staff account created.');
  } finally {
    db.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
