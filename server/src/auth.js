const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const argon2 = require('argon2');
const { rateLimit } = require('express-rate-limit');
const { M, id, fail, text, ok, route, userJSON, requireUser, guardDemo } = require('./lib');
const hashToken = (value) => crypto.createHash('sha256').update(value).digest('hex');
const csrf = () => crypto.randomBytes(32).toString('hex');
const emailInput = (value) => {
  const email = text(value, 'Email', 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.', 'VALIDATION');
  return email;
};
const passwordInput = (value) => {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128)
    fail(400, 'Use a password of 10–128 characters.', 'VALIDATION');
  return value;
};
async function signIn(req, user) {
  const oldSessionId = req.sessionID;
  await new Promise((resolve, reject) =>
    req.session.regenerate((error) => (error ? reject(error) : resolve())),
  );
  req.session.userId = id(user);
  req.session.version = user.sessionVersion;
  req.session.csrfToken = csrf();
  req.user = user;
  await new Promise((resolve, reject) => req.session.save((error) => (error ? reject(error) : resolve())));
  req.app.locals.io?.in(`session:${oldSessionId}`).disconnectSockets(true);
  return { user: userJSON(user, user), csrfToken: req.session.csrfToken };
}
async function deliverToken(req, user, purpose) {
  if (!req.app.locals.options.mailAvailable)
    fail(
      503,
      'Email is not configured for this preview. Please try again after email is enabled.',
      'MAIL_UNAVAILABLE',
    );
  const raw = crypto.randomBytes(32).toString('hex');
  await M.AuthToken.deleteMany({ user: user._id, purpose });
  await M.AuthToken.create({
    user: user._id,
    purpose,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + (purpose === 'reset' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000)),
  });
  const url = `${req.app.locals.options.origin}/${purpose === 'reset' ? 'reset-password' : 'verify-email'}?token=${raw}`;
  const subject = purpose === 'reset' ? 'Reset your Pitchers password' : 'Verify your Pitchers email';
  const message = {
    to: user.email,
    subject,
    text: `${subject}\n\n${url}\n\nIf you did not request this, you can ignore this message.`,
  };
  if (req.app.locals.options.mailMode === 'local') {
    const directory = req.app.locals.options.localMailDir;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`),
      JSON.stringify(message, null, 2),
      { mode: 0o600 },
    );
  } else {
    const { Resend } = require('resend');
    const client = new Resend(process.env.RESEND_API_KEY);
    const result = await client.emails.send({ from: process.env.MAIL_FROM, ...message });
    if (result.error) throw new Error('Email delivery failed.');
  }
}
function authRoutes(router, options) {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.testing ? 1000 : 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: { message: 'Too many attempts. Please try again later.', code: 'RATE_LIMITED' } },
  });
  router.get(
    '/auth/session',
    route(async (req, res) => {
      req.session.csrfToken ||= csrf();
      ok(res, {
        user: userJSON(req.user, req.user),
        csrfToken: req.session.csrfToken,
        features: {
          registrationEnabled: options.allowRegistration,
          demoEnabled: options.demoEnabled,
          passwordRecoveryEnabled: options.mailAvailable,
        },
      });
    }),
  );
  router.post(
    '/auth/register',
    limiter,
    route(async (req, res) => {
      if (!options.allowRegistration)
        fail(
          403,
          'Registration is closed for this preview. You can explore as a guest or use an enabled demo account.',
          'REGISTRATION_CLOSED',
        );
      if (!options.mailAvailable)
        fail(503, 'Registration is unavailable until email delivery is configured.', 'MAIL_UNAVAILABLE');
      const name = text(req.body.name, 'Name', 2, 70);
      const username = text(req.body.username, 'Username', 3, 25).toLowerCase();
      if (!/^[a-z0-9_]+$/.test(username) || ['me', 'admin', 'api', 'demo'].includes(username))
        fail(400, 'Use a username with letters, numbers and underscores.', 'VALIDATION');
      const email = emailInput(req.body.email);
      const password = passwordInput(req.body.password);
      if (await M.User.exists({ $or: [{ email }, { username }] }))
        fail(409, 'Email or username is already registered.', 'CONFLICT');
      const user = await M.User.create({
        name,
        username,
        email,
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      });
      const result = await signIn(req, user);
      try {
        await deliverToken(req, user, 'verify');
      } catch (error) {
        req.app.locals.logger.error('Verification email delivery failed:', error.message);
      }
      ok(res, result, 201);
    }),
  );
  router.post(
    '/auth/login',
    limiter,
    route(async (req, res) => {
      const email = emailInput(req.body.email);
      const password = req.body.password;
      if (typeof password !== 'string' || password.length < 1 || password.length > 128)
        fail(400, 'Enter a valid password.', 'VALIDATION');
      const user = await M.User.findOne({ email }).select('+passwordHash');
      const matches = user
        ? await argon2.verify(user.passwordHash, password).catch(() => false)
        : await argon2
            .verify(req.app.locals.dummyHash, password)
            .then(() => false)
            .catch(() => false);
      if (!user || !matches || user.disabled || user.isDemo)
        fail(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
      ok(res, await signIn(req, user));
    }),
  );
  router.post(
    '/auth/demo',
    limiter,
    route(async (req, res) => {
      if (!options.demoEnabled) fail(403, 'Demo sign-in is disabled.', 'DEMO_DISABLED');
      if (!['maya', 'alex'].includes(req.body.persona)) fail(400, 'Choose Maya or Alex.', 'VALIDATION');
      const user = await M.User.findOne({
        isDemo: true,
        disabled: false,
        $or: [
          { username: req.body.persona },
          { seedKey: `user:${req.body.persona}` },
          { seedKey: `demo:${req.body.persona}` },
        ],
      });
      if (!user) fail(503, 'Demo accounts are not available yet.', 'DEMO_UNAVAILABLE');
      ok(res, await signIn(req, user));
    }),
  );
  router.post(
    '/auth/logout',
    route(async (req, res) => {
      const old = req.sessionID;
      await new Promise((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve())),
      );
      req.session.csrfToken = csrf();
      req.app.locals.io?.in(`session:${old}`).disconnectSockets(true);
      ok(res, { user: null, csrfToken: req.session.csrfToken });
    }),
  );
  router.post(
    '/auth/forgot-password',
    limiter,
    route(async (req, res) => {
      if (!options.mailAvailable)
        fail(503, 'Password recovery is unavailable until email delivery is configured.', 'MAIL_UNAVAILABLE');
      const email = emailInput(req.body.email);
      const user = await M.User.findOne({ email, disabled: false, isDemo: false });
      if (user) {
        try {
          await deliverToken(req, user, 'reset');
        } catch (error) {
          req.app.locals.logger.error('Reset email delivery failed:', error.message);
          fail(
            503,
            'Password recovery is temporarily unavailable. Please try again later.',
            'MAIL_UNAVAILABLE',
          );
        }
      }
      ok(res, { message: 'If an account exists, a reset link has been sent.' });
    }),
  );
  router.post(
    '/auth/reset-password',
    limiter,
    route(async (req, res) => {
      const password = passwordInput(req.body.password);
      const raw = text(req.body.token, 'Token', 32, 128);
      const token = await M.AuthToken.findOne({
        hash: hashToken(raw),
        purpose: 'reset',
        expiresAt: { $gt: new Date() },
      });
      if (!token) fail(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
      const user = await M.User.findById(token.user);
      if (!user || user.disabled || user.isDemo)
        fail(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const consumed = await M.AuthToken.findOneAndDelete({ _id: token._id });
      if (!consumed) fail(400, 'This link has already been used.', 'INVALID_TOKEN');
      user.passwordHash = passwordHash;
      user.sessionVersion += 1;
      await user.save();
      await M.AuthToken.deleteMany({ user: user._id, purpose: 'reset' });
      req.app.locals.io?.in(`user:${id(user)}`).disconnectSockets(true);
      ok(res, { message: 'Password changed. You can now sign in.' });
    }),
  );
  router.post(
    '/auth/verify-email',
    limiter,
    route(async (req, res) => {
      const raw = text(req.body.token, 'Token', 32, 128);
      const token = await M.AuthToken.findOneAndDelete({
        hash: hashToken(raw),
        purpose: 'verify',
        expiresAt: { $gt: new Date() },
      });
      if (!token) fail(400, 'This link is invalid or expired.', 'INVALID_TOKEN');
      await M.User.updateOne({ _id: token.user, isDemo: false }, { $set: { emailVerified: true } });
      ok(res, { message: 'Email verified.' });
    }),
  );
  router.post(
    '/auth/resend-verification',
    limiter,
    route(async (req, res) => {
      requireUser(req);
      guardDemo(req);
      if (!req.user.emailVerified) await deliverToken(req, req.user, 'verify');
      ok(res, { message: 'Verification link sent.' });
    }),
  );
}
module.exports = { authRoutes, csrf };
