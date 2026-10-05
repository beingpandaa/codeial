// Local production-mode smoke only. Dummy provider settings are never used for network requests.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function smoke() {
  const names = ['NODE_ENV', 'CLOUDINARY_URL', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'RESEND_API_KEY', 'MAIL_FROM'];
  const previous = Object.fromEntries(names.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'production';
  delete process.env.CLOUDINARY_URL;
  Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: 'local-smoke-only', CLOUDINARY_API_KEY: 'local-smoke-only', CLOUDINARY_API_SECRET: 'local-smoke-only', RESEND_API_KEY: 'local-smoke-only', MAIL_FROM: 'Pitchers <smoke@example.test>' });
  let database, runtime;
  try {
    const dist = path.resolve(__dirname, '../../client/dist');
    await fs.access(path.join(dist, 'index.html'));
    database = await MongoMemoryServer.create();
    const { createApp } = require('../../server/src/app');
    runtime = await createApp({ mongoUri: database.getUri('codeial_production_smoke'), sessionSecret: crypto.randomBytes(48).toString('hex'), origin: 'https://pitchers.example', uploadsMode: 'cloudinary', mailMode: 'resend', allowRegistration: true, demoEnabled: true });
    const browser = supertest(runtime.app);
    const health = await browser.get('/health').expect(200);
    assert.equal(health.body.status, 'ready');
    const page = await browser.get('/groups/react-collective').expect(200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.text, /<title>.*Pitchers.*<\/title>/);
    assert.match(page.headers['content-security-policy'], /upgrade-insecure-requests/);
    const bundle = page.text.match(/<script[^>]+src="([^"]+)"/)[1];
    assert.match(bundle, /^\/assets\//);
    const script = await browser.get(bundle).expect(200);
    assert.ok(script.text.length > 10_000, 'The SPA entry bundle is served');
    const session = await browser.get('/api/v1/auth/session').set('Host', 'pitchers.example').set('X-Forwarded-Proto', 'https').expect(200);
    const cookie = session.headers['set-cookie'].find(value => value.startsWith('codeial.sid='));
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /; HttpOnly/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.deepEqual(session.body.data.features, { registrationEnabled: true, demoEnabled: true, passwordRecoveryEnabled: true });
    await browser.get('/api/v1/not-a-route').expect(404);
    return { status: 'passed', bundle, spa: true, health: true, secureCookie: true, providerRequests: 0 };
  } finally {
    await runtime?.close();
    await database?.stop();
    for (const key of names) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
}

if (require.main === module) smoke().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { smoke };
