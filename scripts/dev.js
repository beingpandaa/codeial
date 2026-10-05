const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const root = path.resolve(__dirname, '..');
process.chdir(root);
if (fs.existsSync('.env')) process.loadEnvFile('.env');
const preview = process.argv.includes('--preview');
const children = [];
let mongo;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  if (mongo) await mongo.stop();
  process.exit(code);
}
function run(file, args, env) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) void stop(code || 0);
  });
}
(async () => {
  let mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    const dbPath = path.join(root, '.local', 'db');
    fs.mkdirSync(dbPath, { recursive: true });
    mongo = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: 'wiredTiger', dbName: 'codeial_demo' },
    });
    mongoUri = mongo.getUri('codeial_demo');
    console.log('Local MongoDB ready. Demo data persists in .local/db.');
  }
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    MONGODB_URI: mongoUri,
    PORT: process.env.PORT || '4000',
    HOST: '127.0.0.1',
    ORIGIN: preview ? `http://localhost:${process.env.PORT || '4000'}` : 'http://localhost:5173',
    SESSION_SECRET: process.env.SESSION_SECRET || 'codeial-local-development-session-secret-only',
    UPLOADS_MODE: process.env.UPLOADS_MODE || 'local',
    MAIL_MODE: process.env.MAIL_MODE || 'local',
    DEMO_ENABLED: 'true',
  };
  if (new URL(mongoUri).pathname.replace('/', '').endsWith('_demo')) {
    await mongoose.connect(mongoUri);
    const { seedDemo } = require('../server/scripts/seed');
    await seedDemo();
    await mongoose.disconnect();
  }
  run(path.join(root, 'server/src/index.js'), [], env);
  if (!preview) {
    const clientRequire = createRequire(path.join(root, 'client/package.json'));
    const vite = path.join(path.dirname(clientRequire.resolve('vite/package.json')), 'bin/vite.js');
    run(vite, ['client', '--config', 'client/vite.config.js', '--host', 'localhost'], env);
  }
})().catch((error) => {
  console.error(error);
  void stop(1);
});
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
