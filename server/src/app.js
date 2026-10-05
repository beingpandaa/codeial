const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const cors = require('cors');
const argon2 = require('argon2');
const { rateLimit } = require('express-rate-limit');
const { M, fail, route } = require('./lib');
const { authRoutes } = require('./auth');
const { communityRoutes } = require('./community');
const { postRoutes } = require('./posts');
const { mediaRoutes } = require('./media');
const { activityRoutes } = require('./activity');
const root = path.resolve(__dirname, '../..');
const enabled = (value, fallback = true) =>
  value === undefined ? fallback : value === true || value === 'true';
async function createApp(settings = {}) {
  const production = process.env.NODE_ENV === 'production';
  const options = {
    mongoUri: settings.mongoUri || process.env.MONGODB_URI,
    sessionSecret: settings.sessionSecret || process.env.SESSION_SECRET,
    origin: settings.origin || process.env.CLIENT_ORIGIN || process.env.ORIGIN || 'http://localhost:5173',
    testing: Boolean(settings.testing),
    uploadsMode: settings.uploadsMode || process.env.UPLOADS_MODE || 'local',
    mailMode: settings.mailMode || process.env.MAIL_MODE || 'local',
    allowRegistration: enabled(settings.allowRegistration ?? process.env.ALLOW_REGISTRATION),
    demoEnabled: enabled(settings.demoEnabled ?? process.env.DEMO_ENABLED),
    localMediaDir: path.resolve(
      settings.localMediaDir || process.env.LOCAL_MEDIA_DIR || path.join(root, '.local/uploads'),
    ),
    localMailDir: path.resolve(
      settings.localMailDir || process.env.LOCAL_MAIL_DIR || path.join(root, '.local/mail'),
    ),
  };
  if (!options.mongoUri)
    throw new Error('MONGODB_URI is required. Use npm run dev for the managed local database.');
  if (!options.sessionSecret || options.sessionSecret.length < 32)
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  try {
    const configuredOrigin = new URL(options.origin);
    if (
      !['http:', 'https:'].includes(configuredOrigin.protocol) ||
      configuredOrigin.username ||
      configuredOrigin.password ||
      configuredOrigin.pathname !== '/' ||
      configuredOrigin.search ||
      configuredOrigin.hash
    )
      throw new Error('invalid');
    options.origin = configuredOrigin.origin;
  } catch {
    throw new Error('ORIGIN must be a valid HTTP(S) origin without a path.');
  }
  if (
    !['local', 'cloudinary'].includes(options.uploadsMode) ||
    !['local', 'resend'].includes(options.mailMode)
  )
    throw new Error('Unsupported upload or email adapter.');
  if (production) {
    if (!options.origin.startsWith('https://')) throw new Error('A HTTPS ORIGIN is required in production.');
    if (options.uploadsMode === 'local' || options.mailMode === 'local')
      throw new Error('Production requires Cloudinary uploads and Resend email.');
    if (
      !process.env.CLOUDINARY_URL &&
      !(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
      )
    )
      throw new Error('Cloudinary credentials are required.');
    if (options.allowRegistration && (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM))
      throw new Error('Resend credentials and MAIL_FROM are required when registration is enabled.');
  }
  options.mailAvailable =
    options.mailMode === 'local' || Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
  if (mongoose.connection.readyState === 0)
    await mongoose.connect(options.mongoUri, { serverSelectionTimeoutMS: 10000 });
  if (options.uploadsMode === 'cloudinary') {
    require('cloudinary').v2.config({
      secure: true,
      ...(process.env.CLOUDINARY_CLOUD_NAME ? { cloud_name: process.env.CLOUDINARY_CLOUD_NAME } : {}),
      ...(process.env.CLOUDINARY_API_KEY ? { api_key: process.env.CLOUDINARY_API_KEY } : {}),
      ...(process.env.CLOUDINARY_API_SECRET ? { api_secret: process.env.CLOUDINARY_API_SECRET } : {}),
    });
  }
  await Promise.all(Object.values(M).map((model) => model.init()));
  const app = express();
  app.disable('x-powered-by');
  if (production) app.set('trust proxy', 1);
  app.locals.options = options;
  app.locals.logger = console;
  app.locals.dummyHash = await argon2.hash(crypto.randomBytes(24).toString('hex'), { type: argon2.argon2id });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin(origin, callback) {
        callback(null, !origin || origin === options.origin);
      },
      credentials: true,
    }),
  );
  app.get('/health', (req, res) =>
    res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
      status: mongoose.connection.readyState === 1 ? 'ready' : 'unavailable',
      service: 'codeial-api',
    }),
  );
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: options.testing ? 10000 : 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: { message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' } },
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  const store = MongoStore.create({
    mongoUrl: options.mongoUri,
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60,
    autoRemove: 'native',
  });
  const sessionMiddleware = session({
    name: 'codeial.sid',
    secret: options.sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    },
  });
  app.locals.sessionMiddleware = sessionMiddleware;
  app.locals.sessionStore = store;
  app.use('/api', sessionMiddleware);
  app.use(
    '/api',
    route(async (req, res, next) => {
      req.body ||= {};
      if (req.session.userId) {
        const user = await M.User.findById(req.session.userId);
        if (
          user &&
          !user.disabled &&
          user.sessionVersion === req.session.version &&
          (!user.isDemo || options.demoEnabled)
        )
          req.user = user;
        else {
          delete req.session.userId;
          delete req.session.version;
        }
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origin = req.get('origin');
        const requestOrigin = `${req.protocol}://${req.get('host')}`;
        if (origin && origin !== options.origin && origin !== requestOrigin)
          fail(403, 'Request origin is not allowed.', 'CSRF');
        const expected = req.session.csrfToken;
        const provided = req.get('x-csrf-token');
        if (
          !expected ||
          !provided ||
          Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
          !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
        )
          fail(403, 'Your session changed. Refresh and try again.', 'CSRF');
      }
      next();
    }),
  );
  const router = express.Router();
  authRoutes(router, options);
  communityRoutes(router);
  postRoutes(router);
  mediaRoutes(router);
  activityRoutes(router);
  app.use('/api/v1', router);
  app.use('/api', (req, res) =>
    res.status(404).json({ error: { message: 'API route not found.', code: 'NOT_FOUND' } }),
  );
  const dist = path.join(root, 'client/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((req, res) => res.status(404).json({ error: { message: 'Route not found.', code: 'NOT_FOUND' } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.code === 11000)
      return res
        .status(409)
        .json({ error: { message: 'That record already exists. Refresh and try again.', code: 'CONFLICT' } });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res
        .status(413)
        .json({ error: { message: 'Images must be smaller than 5 MB.', code: 'IMAGE_TOO_LARGE' } });
    if (error.name === 'MulterError')
      return res
        .status(400)
        .json({ error: { message: 'Upload one image using the image field.', code: 'VALIDATION' } });
    if (error.type === 'entity.too.large')
      return res.status(413).json({ error: { message: 'Request is too large.', code: 'VALIDATION' } });
    if (error instanceof SyntaxError && error.status === 400)
      return res.status(400).json({ error: { message: 'Invalid JSON body.', code: 'VALIDATION' } });
    if (['ValidationError', 'CastError'].includes(error.name))
      return res.status(400).json({ error: { message: 'Invalid request fields.', code: 'VALIDATION' } });
    const status = error.status || 500;
    if (status >= 500) app.locals.logger.error('Request failed:', error.name, error.message);
    res.status(status).json({
      error: {
        message: status >= 500 ? 'Something went wrong. Please try again.' : error.message,
        code: error.code || 'INTERNAL_ERROR',
      },
    });
  });
  return {
    app,
    close: async () => {
      await store.close();
      await mongoose.disconnect();
    },
  };
}
module.exports = { createApp };
