// A fresh database and storage directory per browser run. Never reads .env or .local/db.
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../../server/src/app');
const { attachSockets } = require('../../server/src/sockets');
const { seedDemo } = require('../../server/scripts/seed');

const root = path.resolve(__dirname, '../..');
const scratchRoot = path.join(root, '.local/test-runtime');
let scratch, database, runtime, server, sockets;
let stopping = false;

async function stop() {
  if (stopping) return;
  stopping = true;
  if (sockets) await new Promise(resolve => sockets.close(resolve));
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await runtime?.close();
  await database?.stop();
  if (scratch && path.dirname(path.resolve(scratch)) === scratchRoot && path.basename(scratch).startsWith('browser-'))
    await fs.rm(scratch, { recursive: true, force: true });
}

async function start() {
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  const build = spawnSync(process.execPath, [vite, 'build'], { cwd: path.join(root, 'client'), stdio: 'inherit' });
  if (build.status !== 0) throw new Error('Client build failed before browser tests.');
  await fs.mkdir(scratchRoot, { recursive: true });
  scratch = await fs.mkdtemp(path.join(scratchRoot, 'browser-'));
  process.env.NODE_ENV = 'test';
  process.env.UPLOADS_MODE = 'local';
  process.env.MAIL_MODE = 'local';
  process.env.LOCAL_MEDIA_DIR = path.join(scratch, 'media');
  process.env.LOCAL_MAIL_DIR = path.join(scratch, 'mail');
  database = await MongoMemoryServer.create();
  const mongoUri = database.getUri('codeial_browser_demo');
  await mongoose.connect(mongoUri);
  await seedDemo();
  runtime = await createApp({ mongoUri, origin: 'http://127.0.0.1:4178', sessionSecret: crypto.randomBytes(48).toString('hex'), testing: true, uploadsMode: 'local', mailMode: 'local', allowRegistration: true, demoEnabled: true });
  server = http.createServer(runtime.app);
  sockets = attachSockets(server, runtime.app);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4178, '127.0.0.1', resolve); });
  console.log('Isolated browser test server ready on http://127.0.0.1:4178');
}

for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop().then(() => process.exit(0)));
start().catch(async error => { console.error(error); await stop(); process.exit(1); });
