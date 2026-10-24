const { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const derive = promisify(scrypt);
const fail = (status, message) => Object.assign(Error(message), { status });
const publicUser = (user) => ({
  id: user.id,
  login: user.login,
  name: user.name,
  group: user.group_name,
  role: user.role,
});
async function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return 'scrypt$' + salt + '$' + key.toString('hex');
}
async function verifyPassword(password, encoded) {
  const [, salt, key] = encoded.split('$');
  const candidate = (await passwordHash(password, salt)).split('$')[2];
  return timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(key, 'hex'));
}
function credentials(body) {
  if (
    typeof body?.login !== 'string' ||
    !/^[a-z0-9_.-]{3,30}$/i.test(body.login) ||
    typeof body.password !== 'string' ||
    body.password.length < 8 ||
    body.password.length > 256
  )
    throw fail(400, 'Проверь логин и пароль (8–256 символов).');
  return { login: body.login.toLowerCase(), password: body.password };
}
function profile(body) {
  if (
    typeof body?.name !== 'string' ||
    !body.name.trim() ||
    body.name.trim().length > 80 ||
    typeof body.group !== 'string' ||
    !body.group.trim() ||
    body.group.trim().length > 30
  )
    throw fail(400, 'Укажи имя и группу допустимой длины.');
  return { name: body.name.trim(), group: body.group.trim() };
}
async function createUser(db, body, role = 'student', beforeInsert = () => {}) {
  const { login, password } = credentials(body),
    data = profile(body);
  const user = {
    id: randomUUID(),
    login,
    password_hash: await passwordHash(password),
    name: data.name,
    group_name: data.group,
    role,
  };
  try {
    beforeInsert();
    db.prepare('INSERT INTO users VALUES (@id,@login,@password_hash,@name,@group_name,@role)').run(
      user,
    );
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw fail(409, 'Этот логин уже занят.');
    throw error;
  }
  return publicUser(user);
}
const digest = (token) => createHash('sha256').update(token).digest('hex');
function createSessions(db, { secure = false, ttl = 12 * 60 * 60 * 1000 } = {}) {
  const cookieName = secure ? '__Host-okei.sid' : 'okei.sid';
  const options = { httpOnly: true, secure, sameSite: 'strict', path: '/' };
  function issue(res, user) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare(
      'DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE user_id=? ORDER BY expires DESC LIMIT -1 OFFSET 9)',
    ).run(user.id);
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), user.id, Date.now() + ttl);
    res.cookie(cookieName, token, { ...options, maxAge: ttl });
  }
  function token(req) {
    const value = (req.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    return value && /^[\w-]{43}$/.test(value) ? value : null;
  }
  function identify(req, res, next) {
    const value = token(req);
    req.user = value
      ? db
          .prepare(
            'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires>?',
          )
          .get(digest(value), Date.now())
      : null;
    next();
  }
  function logout(req, res) {
    const value = token(req);
    if (value) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(value));
    res.clearCookie(cookieName, options);
  }
  return { issue, identify, logout };
}
function createLoginLimiter() {
  const attempts = new Map();
  return (req, res, next) => {
    const now = Date.now(),
      login = typeof req.body?.login === 'string' ? req.body.login.toLowerCase().slice(0, 30) : '';
    for (const [key, bucket] of attempts) if (bucket.until <= now) attempts.delete(key);
    if (attempts.size > 10000) return next(fail(429, 'Повтори вход позже.'));
    for (const key of [req.ip, req.ip + ':' + login]) {
      const bucket = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
      if (++bucket.count > (key === req.ip ? 50 : 10))
        return next(fail(429, 'Слишком много попыток. Повтори вход через 15 минут.'));
      attempts.set(key, bucket);
    }
    next();
  };
}
module.exports = {
  fail,
  publicUser,
  passwordHash,
  verifyPassword,
  credentials,
  profile,
  createUser,
  createSessions,
  createLoginLimiter,
};
