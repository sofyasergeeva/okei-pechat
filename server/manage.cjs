const path = require('node:path');
const { openDatabase } = require('./db.cjs');
const { createUser } = require('./auth.cjs');
(async () => {
  if (process.argv[2] !== 'staff') throw Error('Usage: node server/manage.cjs staff');
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
