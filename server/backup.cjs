const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};
function targetDirectory(source, target) {
  const parent = fs.realpathSync(path.dirname(path.resolve(target)));
  const destination = path.join(parent, path.basename(target));
  const publicDir = fs.realpathSync(path.join(__dirname, '../dist'));
  if (inside(publicDir, destination) || inside(source, destination) || inside(destination, source))
    throw Error('Backup and restored data must be separate and outside dist');
  const project = path.resolve(__dirname, '..');
  if (
    inside(project, destination) &&
    !inside(path.join(project, 'var'), destination) &&
    !inside(path.join(project, 'backups'), destination)
  )
    throw Error('Use an external backup/data directory or ignored var/backups');
  if (fs.existsSync(destination)) throw Error('Destination already exists; use a new directory');
  return destination;
}
async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function records(db) {
  if (
    db.pragma('integrity_check', { simple: true }) !== 'ok' ||
    db.pragma('foreign_key_check').length
  )
    throw Error('Database integrity check failed');
  return db.prepare('SELECT storage_name,size FROM files ORDER BY id').all();
}
function attachment(directory, row) {
  if (!/^[a-f0-9-]{36}\.(pdf|png|json)$/.test(row.storage_name))
    throw Error('Invalid attachment path');
  const file = path.join(directory, 'pdf', row.storage_name);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== row.size)
    throw Error('Missing or changed attachment');
  return file;
}
async function copy(source, destination) {
  await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  await fs.promises.chmod(destination, 0o600);
}
async function createBackup(dataDir, backupDir) {
  const source = fs.realpathSync(dataDir),
    target = targetDirectory(source, backupDir);
  fs.mkdirSync(target, { mode: 0o700 });
  // A manifest is written last. An interrupted directory is never considered restorable.
  const databasePath = path.join(target, 'okei.sqlite');
  const live = new Database(path.join(source, 'okei.sqlite'), {
    readonly: true,
    fileMustExist: true,
  });
  try {
    await live.backup(databasePath);
  } finally {
    live.close();
  }
  fs.chmodSync(databasePath, 0o600);
  const snapshot = new Database(databasePath, { readonly: true, fileMustExist: true });
  let files;
  try {
    files = records(snapshot);
  } finally {
    snapshot.close();
  }
  fs.mkdirSync(path.join(target, 'pdf'), { mode: 0o700 });
  for (const row of files) {
    const destination = path.join(target, 'pdf', row.storage_name);
    await copy(attachment(source, row), destination);
    row.sha256 = await checksum(destination);
    attachment(target, row);
  }
  const manifest = {
    version: 1,
    created: new Date().toISOString(),
    database: await checksum(databasePath),
    files,
  };
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  return target;
}
async function restoreBackup(backupDir, dataDir) {
  const source = fs.realpathSync(backupDir),
    target = targetDirectory(source, dataDir);
  const manifestPath = path.join(source, 'manifest.json');
  if (fs.statSync(manifestPath).size > 2 * 1024 * 1024) throw Error('Invalid backup manifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files))
    throw Error('Invalid backup manifest');
  const databasePath = path.join(source, 'okei.sqlite');
  if ((await checksum(databasePath)) !== manifest.database)
    throw Error('Database checksum mismatch');
  const snapshot = new Database(databasePath, { readonly: true, fileMustExist: true });
  let files;
  try {
    files = records(snapshot);
  } finally {
    snapshot.close();
  }
  if (files.length !== manifest.files.length) throw Error('Backup file list mismatch');
  for (let i = 0; i < files.length; i++) {
    const row = files[i],
      entry = manifest.files[i];
    if (
      entry.storage_name !== row.storage_name ||
      entry.size !== row.size ||
      (await checksum(attachment(source, row))) !== entry.sha256
    )
      throw Error('Attachment checksum mismatch');
  }
  fs.mkdirSync(target, { mode: 0o700 });
  const incomplete = path.join(target, 'RESTORE_INCOMPLETE');
  fs.writeFileSync(
    incomplete,
    'Do not start the application in this directory until restore succeeds.\n',
    { flag: 'wx', mode: 0o600 },
  );
  fs.mkdirSync(path.join(target, 'pdf'), { mode: 0o700 });
  await copy(databasePath, path.join(target, 'okei.sqlite'));
  for (const row of files)
    await copy(attachment(source, row), path.join(target, 'pdf', row.storage_name));
  if ((await checksum(path.join(target, 'okei.sqlite'))) !== manifest.database)
    throw Error('Restore database checksum mismatch');
  for (const entry of manifest.files)
    if ((await checksum(attachment(target, entry))) !== entry.sha256)
      throw Error('Restore file checksum mismatch');
  // Revoked cookies from the snapshot must not become valid again after recovery.
  const recovered = new Database(path.join(target, 'okei.sqlite'));
  try {
    recovered.prepare('DELETE FROM sessions').run();
    records(recovered);
  } finally {
    recovered.close();
  }
  fs.unlinkSync(incomplete);
  return target;
}
module.exports = { createBackup, restoreBackup };
