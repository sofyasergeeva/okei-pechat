const path = require('node:path');
const { createApi } = require('./app.cjs');
(async () => {
  const port = Number(process.env.PORT || 8080),
    host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const api = await createApi({
    dataDir: process.env.DATA_DIR || path.join(__dirname, '../var/okei'),
    origin: process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port,
    secureCookies: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
  });
  const server = api.app.listen(port, host, () =>
    console.log('OKEI API: ' + api.app.locals.origin + '/?mode=server'),
  );
  server.on('error', (error) => {
    api.close();
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.close(() => {
        api.close();
        process.exit(0);
      });
      server.closeAllConnections();
    });
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
