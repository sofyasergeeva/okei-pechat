const path = require('node:path');
const { createApi } = require('./app.cjs');
(async () => {
  const port = Number(process.env.PORT || 8080),
    host = process.env.HOST || '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const origin = process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:' + port;
  const production = process.env.NODE_ENV === 'production';
  const url = new URL(origin);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials or a path');
  if (production && url.protocol !== 'https:')
    throw Error('Production requires an HTTPS PUBLIC_ORIGIN');
  const api = await createApi({
    dataDir: process.env.DATA_DIR || path.join(__dirname, '../var/okei'),
    origin,
    serverOnly: production || process.env.SERVER_ONLY !== 'false',
    trustProxy: process.env.TRUST_PROXY || false,
    limits: Object.fromEntries(
      [
        ['USER_STORAGE_MB', 'userBytes', 1048576],
        ['TOTAL_STORAGE_MB', 'totalBytes', 1048576],
        ['MAX_USER_ORDERS', 'userOrders', 1],
        ['MAX_ORDERS', 'totalOrders', 1],
        ['MAX_USERS', 'users', 1],
      ]
        .filter(([name]) => process.env[name] !== undefined)
        .map(([name, key, scale]) => [key, Number(process.env[name]) * scale]),
    ),
    secureCookies: process.env.COOKIE_SECURE === 'true' || url.protocol === 'https:' || production,
  });
  const server = api.app.listen(port, host, () =>
    console.log('OKEI API: ' + api.app.locals.origin + '/?mode=server'),
  );
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  server.on('error', (error) => {
    api.close();
    console.error(error.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      server.close(async () => {
        await api.drain();
        api.close();
      });
      server.closeIdleConnections();
    });
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
