const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const supertest = require('supertest');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const M = require('../src/models');

test('closed registration and disabled demos are enforced, and missing email never reports success', { timeout: 180_000 }, async () => {
  const saved = { apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  let runtime, database;
  try {
    database = await MongoMemoryServer.create();
    runtime = await createApp({ mongoUri: database.getUri('codeial_policy_test'), sessionSecret: crypto.randomBytes(48).toString('hex'), origin: 'http://localhost:5173', testing: true, allowRegistration: false, demoEnabled: false, mailMode: 'resend', uploadsMode: 'local' });
    runtime.app.locals.logger = { error() {} };
    const browser = supertest.agent(runtime.app);
    const session = (await browser.get('/api/v1/auth/session').expect(200)).body.data;
    assert.deepEqual(session.features, { registrationEnabled: false, demoEnabled: false, passwordRecoveryEnabled: false });
    let csrf = session.csrfToken;
    const write = (route, body) => browser.post(`/api/v1/auth/${route}`).set('Origin', 'http://localhost:5173').set('X-CSRF-Token', csrf).send(body);
    const registration = await write('register', { name: 'Closed registration', username: 'closed_user', email: 'closed@example.test', password: 'ClosedRegistration!42' }).expect(403);
    assert.equal(registration.body.error.code, 'REGISTRATION_CLOSED');
    assert.equal((await write('demo', { persona: 'maya' }).expect(403)).body.error.code, 'DEMO_DISABLED');
    assert.equal(await M.User.countDocuments(), 0);
    assert.equal((await write('forgot-password', { email: 'unknown@example.test' }).expect(503)).body.error.code, 'MAIL_UNAVAILABLE');
    await M.User.create({ name: 'Existing user', username: 'existing_user', email: 'existing@example.test', passwordHash: await argon2.hash('ExistingPassword!42'), emailVerified: false });
    csrf = (await write('login', { email: 'existing@example.test', password: 'ExistingPassword!42' }).expect(200)).body.data.csrfToken;
    assert.equal((await write('forgot-password', { email: 'existing@example.test' }).expect(503)).body.error.code, 'MAIL_UNAVAILABLE');
    assert.equal((await write('resend-verification', {}).expect(503)).body.error.code, 'MAIL_UNAVAILABLE');
    assert.equal(await M.AuthToken.countDocuments(), 0, 'No unusable email tokens should be created');
  } finally {
    await runtime?.close();
    await database?.stop();
    for (const [key, value] of [['RESEND_API_KEY', saved.apiKey], ['MAIL_FROM', saved.from]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
