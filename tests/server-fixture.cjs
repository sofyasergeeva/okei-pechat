const { createApi } = require('../server/app.cjs');
const { createUser } = require('../server/auth.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'okei-browser-api-'));
  const api = await createApi({
    dataDir: directory,
    origin: 'http://127.0.0.1:18088',
    serverOnly: true,
  });
  await createUser(
    api.db,
    {
      login: 'browser_operator',
      password: 'browser-password-2026',
      name: 'Тестовый сотрудник',
      group: 'Типография',
    },
    'staff',
  );
  const server = api.app.listen(18088, '127.0.0.1');
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.on(signal, () => {
      server.close(async () => {
        await api.drain();
        api.close();
        if (
          path.dirname(directory) !== os.tmpdir() ||
          !path.basename(directory).startsWith('okei-browser-api-')
        )
          throw Error('Invalid test directory');
        await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
        process.exit(0);
      });
      server.closeAllConnections();
    });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
