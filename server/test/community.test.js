const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const supertest = require('supertest');
const { io: connectSocket } = require('socket.io-client');
const sharp = require('sharp');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { createApp } = require('../src/app');
const { attachSockets } = require('../src/sockets');
const M = require('../src/models');

const origin = 'http://localhost:5173';
const password = 'CodeialTestPass!42';
const workDirectory = path.resolve(__dirname, '../../.local/test-runtime');
let database;
let runtime;
let app;
let scratch;
let nextUser = 0;
let httpServer;
let sockets;
let socketOrigin;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ids = response => response.body.data.items.map(item => item.id);

before(async () => {
  await fs.mkdir(workDirectory, { recursive: true });
  scratch = await fs.mkdtemp(path.join(workDirectory, 'community-test-'));
  database = await MongoMemoryServer.create();
  runtime = await createApp({
    mongoUri: database.getUri('codeial_integration'),
    sessionSecret: crypto.randomBytes(48).toString('hex'),
    origin,
    testing: true,
    uploadsMode: 'local',
    mailMode: 'local',
    localMediaDir: path.join(scratch, 'media'),
    localMailDir: path.join(scratch, 'mail'),
  });
  app = runtime.app;
  httpServer = http.createServer(app);
  sockets = attachSockets(httpServer, app);
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', resolve));
  socketOrigin = `http://127.0.0.1:${httpServer.address().port}`;
}, { timeout: 180_000 });

beforeEach(async () => {
  await Promise.all(Object.values(M).map(model => model.deleteMany({})));
  await mongoose.connection.collection('sessions').deleteMany({});
});

after(async () => {
  if (sockets) await new Promise(resolve => sockets.close(resolve));
  await runtime?.close();
  await database?.stop();
  if (scratch) {
    assert.equal(path.dirname(path.resolve(scratch)), workDirectory);
    assert.ok(path.basename(scratch).startsWith('community-test-'));
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

async function browser() {
  const agent = supertest.agent(app);
  const session = await agent.get('/api/v1/auth/session').expect(200);
  const client = {
    agent,
    cookie: session.headers['set-cookie']?.map(value => value.split(';')[0]).join('; '),
    token: session.body.data.csrfToken,
    async request(method, url, body, status = 200) {
      let request = agent[method](`/api/v1${url}`).set('Origin', origin);
      if (!['get', 'head'].includes(method)) request = request.set('X-CSRF-Token', client.token);
      if (body !== undefined) request = request.send(body);
      const response = await request;
      if (response.headers['set-cookie']) client.cookie = response.headers['set-cookie'].map(value => value.split(';')[0]).join('; ');
      if (status !== null) assert.equal(response.status, status, `${method.toUpperCase()} ${url}: ${JSON.stringify(response.body)}`);
      if (response.body.data?.csrfToken) client.token = response.body.data.csrfToken;
      return response;
    },
  };
  assert.equal(typeof client.token, 'string');
  return client;
}

async function user() {
  const client = await browser();
  const number = ++nextUser;
  const account = { name: `Test Person ${number}`, username: `person_${number}`, email: `person${number}@example.test`, password };
  const response = await client.request('post', '/auth/register', { ...account, role: 'admin' }, 201);
  client.user = response.body.data.user;
  client.account = account;
  assert.equal(client.user.role, 'user', 'Registration must ignore attempted privilege escalation');
  return client;
}

async function post(client, fields = {}) {
  const response = await client.request('post', '/posts', {
    type: 'discussion', title: 'A community integration test', body: 'Sharing a useful implementation lesson.',
    tags: ['testing'], visibility: 'public', mediaIds: [], ...fields,
  }, 201);
  return response.body.data;
}

async function group(client, visibility = 'private') {
  return (await client.request('post', '/groups', { name: 'Integration Study Group', description: 'A group for testing authorization.', rules: 'Be kind.', visibility }, 201)).body.data;
}

async function join(owner, member, target) {
  const response = await member.request('post', `/groups/${target.id}/join`, {});
  if (response.body.data.membership === 'pending') await owner.request('post', `/groups/${target.id}/members/${member.user.id}/approve`, {});
}

async function friends(first, second) {
  await first.request('post', `/users/${second.user.id}/friend-request`, {});
  await second.request('post', `/users/${first.user.id}/friend-accept`, {});
}

async function denied(client, method, url, body) {
  const response = await client.request(method, url, body, null);
  assert.ok([401, 403, 404].includes(response.status), `${method} ${url} should be denied: ${response.status} ${JSON.stringify(response.body)}`);
  assert.equal(typeof response.body.error?.code, 'string');
  return response;
}

async function upload(client) {
  // Encode a valid fixture, then exercise the real multipart parser and decoder.
  const buffer = await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 120, g: 80, b: 200, alpha: 1 } },
  }).png().toBuffer();
  const response = await client.agent.post('/api/v1/media').set('Origin', origin).set('X-CSRF-Token', client.token)
    .attach('image', buffer, { filename: 'pixel.png', contentType: 'image/png' });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.data;
}

test('session CSRF is required, bound to its cookie and rotated after sign-in', async () => {
  const guest = await browser();
  const oldToken = guest.token;
  const body = { name: 'CSRF Person', username: 'csrf_person', email: 'csrf@example.test', password };
  await guest.agent.post('/api/v1/auth/register').send(body).expect(403);
  await guest.agent.post('/api/v1/auth/register').set('Origin', 'https://attacker.example').set('X-CSRF-Token', oldToken).send(body).expect(403);
  const signedIn = await guest.request('post', '/auth/register', body, 201);
  assert.notEqual(guest.token, oldToken);
  assert.match(signedIn.headers['set-cookie'].join(';'), /HttpOnly/);
  assert.match(signedIn.headers['set-cookie'].join(';'), /SameSite=Lax/i);
  await guest.agent.post('/api/v1/posts').set('X-CSRF-Token', oldToken).send({ title: 'Forgery', body: 'No' }).expect(403);
  const other = await browser();
  await other.agent.post('/api/v1/posts').set('X-CSRF-Token', guest.token).send({ title: 'Forgery', body: 'No' }).expect(403);
  assert.equal(await M.Post.countDocuments(), 0);
  const stored = await M.User.findOne({ email: body.email }).select('+passwordHash');
  assert.match(stored.passwordHash, /^\$argon2id\$/);
  assert.ok(!JSON.stringify(signedIn.body).includes('passwordHash'));
  await guest.request('post', '/auth/logout', {});
  assert.equal((await guest.request('get', '/auth/session')).body.data.user, null);
  await denied(guest, 'post', '/posts', { title: 'After logout', body: 'No' });
});

test('password-reset mail contains a single-use token, expires, and revokes prior sessions', async () => {
  const owner = await user();
  const resetter = await browser();
  const known = await resetter.request('post', '/auth/forgot-password', { email: owner.account.email });
  const unknown = await resetter.request('post', '/auth/forgot-password', { email: 'not-registered@example.test' });
  assert.deepEqual(known.body, unknown.body, 'Password reset must not disclose registered addresses');
  const messages = await Promise.all((await fs.readdir(path.join(scratch, 'mail'))).map(async file => JSON.parse(await fs.readFile(path.join(scratch, 'mail', file), 'utf8'))));
  const mail = messages.find(item => item.to === owner.account.email && item.subject.startsWith('Reset'));
  assert.ok(mail, 'The development mail adapter must produce a reset message');
  const token = new URL(mail.text.split('\n').find(line => line.startsWith(origin))).searchParams.get('token');
  const stored = await M.AuthToken.findOne({ user: owner.user.id, purpose: 'reset' });
  assert.equal(stored.hash, hash(token));
  assert.notEqual(stored.hash, token);
  const expired = crypto.randomBytes(32).toString('hex');
  await M.AuthToken.create({ user: owner.user.id, purpose: 'reset', hash: hash(expired), expiresAt: new Date(Date.now() - 60_000) });
  await resetter.request('post', '/auth/reset-password', { token: expired, password: 'ReplacementPass!456' }, 400);
  await resetter.request('post', '/auth/reset-password', { token, password: 'ReplacementPass!456' });
  await resetter.request('post', '/auth/reset-password', { token, password }, 400);
  assert.equal((await owner.request('get', '/auth/session')).body.data.user, null);
  await resetter.request('post', '/auth/login', { email: owner.account.email, password }, 401);
  await resetter.request('post', '/auth/login', { email: owner.account.email, password: 'ReplacementPass!456' });
});

test('expired server sessions cannot continue an authenticated request', async () => {
  const owner = await user();
  const sessions = mongoose.connection.collection('sessions');
  assert.ok(await sessions.countDocuments());
  await sessions.updateMany({}, { $set: { expires: new Date(Date.now() - 60_000) } });
  assert.equal((await owner.request('get', '/auth/session')).body.data.user, null);
  await denied(owner, 'post', '/posts', { title: 'Expired session', body: 'No access.' });
});

test('repeated likes, saves, follows and friendship requests preserve a single relationship', async () => {
  const author = await user();
  const reader = await user();
  const item = await post(author);
  for (let repeat = 0; repeat < 3; repeat++) {
    await reader.request('put', `/posts/${item.id}/like`);
    await reader.request('put', `/posts/${item.id}/save`);
    await reader.request('put', `/users/${author.user.id}/follow`);
    await reader.request('post', `/users/${author.user.id}/friend-request`, {});
  }
  assert.equal(await M.Like.countDocuments({ target: item.id }), 1);
  assert.equal(await M.Save.countDocuments({ post: item.id }), 1);
  assert.equal(await M.Follow.countDocuments(), 1);
  assert.equal(await M.Friendship.countDocuments(), 1);
  await denied(reader, 'post', `/users/${author.user.id}/friend-accept`, {});
  await author.request('post', `/users/${reader.user.id}/friend-accept`, {});
  await author.request('post', `/users/${reader.user.id}/friend-accept`, {});
  assert.equal((await reader.request('get', '/relationships')).body.data.friends.length, 1);
  assert.equal((await author.request('get', '/notifications')).body.data.items.filter(n => n.kind === 'post_like').length, 1);
  for (let repeat = 0; repeat < 2; repeat++) {
    await reader.request('delete', `/posts/${item.id}/like`);
    await reader.request('delete', `/posts/${item.id}/save`);
    await reader.request('delete', `/users/${author.user.id}/follow`);
  }
  assert.equal(await M.Like.countDocuments(), 0);
  assert.equal(await M.Save.countDocuments(), 0);
  assert.equal(await M.Follow.countDocuments(), 0);
});

test('ownership prevents edits, deletion, role escalation and attaching another user media', async () => {
  const author = await user();
  const outsider = await user();
  const item = await post(author);
  await denied(outsider, 'patch', `/posts/${item.id}`, { body: 'Unauthorized replacement' });
  await denied(outsider, 'delete', `/posts/${item.id}`);
  const comment = (await author.request('post', `/posts/${item.id}/comments`, { body: 'The original comment.' }, 201)).body.data;
  await denied(outsider, 'patch', `/comments/${comment.id}`, { body: 'Unauthorized replacement' });
  await denied(outsider, 'delete', `/comments/${comment.id}`);
  await outsider.request('patch', '/users/me', { name: 'Still a regular user', role: 'admin', emailVerified: true });
  assert.equal((await M.User.findById(outsider.user.id)).role, 'user');
  await denied(outsider, 'get', '/admin/reports');
  const media = await upload(author);
  await supertest(app).get(media.url).expect(404);
  await outsider.request('post', '/posts', { title: 'Stolen media', body: 'Must fail', mediaIds: [media.id] }, 400);
  const unchanged = await author.request('get', `/posts/${item.id}`);
  assert.equal(unchanged.body.data.body, item.body);
});

test('private-group requests stay pending and removal revokes posts, media, saves and notifications', async () => {
  const owner = await user();
  const member = await user();
  const outsider = await user();
  const target = await group(owner);
  const pending = await member.request('post', `/groups/${target.id}/join`, {});
  assert.equal(pending.body.data.membership, 'pending');
  await denied(member, 'get', `/groups/${target.id}/members`);
  const media = await upload(owner);
  const item = await post(owner, { visibility: 'group', groupId: target.id, mediaIds: [media.id] });
  for (const visitor of [member, outsider]) {
    await visitor.request('get', `/posts/${item.id}`, undefined, 404);
    assert.deepEqual(ids(await visitor.request('get', `/posts?group=${target.id}`)), []);
    await visitor.agent.get(media.url).expect(404);
  }
  await supertest(app).get(`/api/v1/posts/${item.id}`).expect(404);
  await owner.request('post', `/groups/${target.id}/members/${member.user.id}/approve`, {});
  await member.request('put', `/posts/${item.id}/save`);
  const comment = (await member.request('post', `/posts/${item.id}/comments`, { body: 'Member-only discussion.' }, 201)).body.data;
  await owner.request('post', `/posts/${item.id}/comments`, { body: 'A private reply.', parentId: comment.id }, 201);
  assert.ok((await member.request('get', '/notifications')).body.data.items.some(n => n.postId === item.id));
  const image = await member.agent.get(media.url).expect(200);
  assert.match(image.headers['cache-control'], /no-store/);
  assert.equal(image.headers['content-type'], 'image/webp');
  assert.equal(image.headers.location, undefined, 'Protected media must stream without redirecting');
  await owner.request('delete', `/groups/${target.id}/members/${member.user.id}`);
  await member.request('get', `/posts/${item.id}`, undefined, 404);
  await member.agent.get(media.url).expect(404);
  assert.ok(!ids(await member.request('get', '/posts?feed=saved')).includes(item.id));
  assert.ok(!(await member.request('get', '/notifications')).body.data.items.some(n => n.postId === item.id || n.groupId === target.id));
  await denied(member, 'put', `/posts/${item.id}/like`);
});

test('public groups are readable but require membership for posts, likes and comments', async () => {
  const owner = await user();
  const visitor = await user();
  const target = await group(owner, 'public');
  const item = await post(owner, { visibility: 'group', groupId: target.id });
  await supertest(app).get(`/api/v1/posts/${item.id}`).expect(200);
  await visitor.request('get', `/posts/${item.id}`);
  await denied(visitor, 'put', `/posts/${item.id}/like`);
  await denied(visitor, 'post', `/posts/${item.id}/comments`, { body: 'I have not joined.' });
  await denied(visitor, 'post', '/posts', { title: 'Outside group', body: 'Must join first.', visibility: 'group', groupId: target.id });
  await join(owner, visitor, target);
  await visitor.request('put', `/posts/${item.id}/like`);
  await visitor.request('post', `/posts/${item.id}/comments`, { body: 'Now a member.' }, 201);
  await visitor.request('delete', `/groups/${target.id}/membership`);
  await visitor.request('get', `/posts/${item.id}`);
  await denied(visitor, 'put', `/posts/${item.id}/like`);
});

test('unfriending immediately revokes friends-only posts, bookmarks and image access', async () => {
  const author = await user();
  const reader = await user();
  await friends(author, reader);
  const media = await upload(author);
  const item = await post(author, { visibility: 'friends', mediaIds: [media.id] });
  await reader.request('put', `/posts/${item.id}/save`);
  await reader.agent.get(media.url).expect(200);
  await reader.request('delete', `/users/${author.user.id}/friend`);
  await reader.request('get', `/posts/${item.id}`, undefined, 404);
  await reader.agent.get(media.url).expect(404);
  assert.ok(!ids(await reader.request('get', '/posts?feed=saved')).includes(item.id));
  await supertest(app).get(`/api/v1/posts/${item.id}`).expect(404);
});

test('blocking severs relationships and hides profiles, content, comments and notifications both ways', async () => {
  const first = await user();
  const second = await user();
  const third = await user();
  await friends(first, second);
  await first.request('put', `/users/${second.user.id}/follow`);
  await second.request('put', `/users/${first.user.id}/follow`);
  const firstPost = await post(first);
  const secondPost = await post(second);
  const thirdPost = await post(third);
  const hiddenComment = (await second.request('post', `/posts/${thirdPost.id}/comments`, { body: 'A comment hidden by the block.' }, 201)).body.data;
  await second.request('put', `/posts/${firstPost.id}/like`);
  assert.ok((await first.request('get', '/notifications')).body.data.items.length);
  await first.request('put', `/users/${second.user.id}/block`);
  assert.equal(await M.Friendship.countDocuments(), 0);
  assert.equal(await M.Follow.countDocuments(), 0);
  for (const [viewer, other, item] of [[first, second, secondPost], [second, first, firstPost]]) {
    await viewer.request('get', `/users/${other.user.username}`, undefined, 404);
    await viewer.request('get', `/posts/${item.id}`, undefined, 404);
    assert.ok(!ids(await viewer.request('get', `/posts?author=${other.user.id}`)).includes(item.id));
    assert.ok(!(await viewer.request('get', '/notifications')).body.data.items.some(n => n.actor.id === other.user.id));
    await denied(viewer, 'post', `/users/${other.user.id}/friend-request`, {});
  }
  assert.ok(!ids(await first.request('get', `/posts/${thirdPost.id}/comments`)).includes(hiddenComment.id));
  await first.request('delete', `/users/${second.user.id}/block`);
  await first.request('get', `/posts/${secondPost.id}`);
  assert.deepEqual((await first.request('get', '/relationships')).body.data.friends, [], 'Unblocking must not silently restore friendship');
});

test('solutions belong to the help post and deleting the accepted answer reopens it', async () => {
  const asker = await user();
  const helper = await user();
  const item = await post(asker, { type: 'help' });
  const other = await post(asker, { type: 'help' });
  const answer = (await helper.request('post', `/posts/${item.id}/comments`, { body: 'Try a conditional database update.' }, 201)).body.data;
  const wrongAnswer = (await helper.request('post', `/posts/${other.id}/comments`, { body: 'This answer belongs elsewhere.' }, 201)).body.data;
  await denied(helper, 'put', `/posts/${item.id}/solution`, { commentId: answer.id });
  await asker.request('put', `/posts/${item.id}/solution`, { commentId: wrongAnswer.id }, 400);
  const solved = await asker.request('put', `/posts/${item.id}/solution`, { commentId: answer.id });
  assert.equal(solved.body.data.status, 'solved');
  assert.equal(solved.body.data.solutionCommentId, answer.id);
  await helper.request('delete', `/comments/${answer.id}`);
  const reopened = await asker.request('get', `/posts/${item.id}`);
  assert.equal(reopened.body.data.status, 'open');
  assert.equal(reopened.body.data.solutionCommentId, null);
  await asker.request('put', `/posts/${item.id}/solution`, { commentId: answer.id }, 400);
});

test('ownership transfer preserves one owner and enforces moderator boundaries', async () => {
  const owner = await user();
  const moderator = await user();
  const member = await user();
  const target = await group(owner);
  await join(owner, moderator, target);
  await join(owner, member, target);
  await denied(member, 'patch', `/groups/${target.id}/members/${member.user.id}`, { role: 'moderator' });
  await owner.request('patch', `/groups/${target.id}/members/${moderator.user.id}`, { role: 'moderator' });
  await denied(moderator, 'delete', `/groups/${target.id}/members/${owner.user.id}`);
  await denied(moderator, 'post', `/groups/${target.id}/transfer`, { userId: member.user.id });
  await owner.request('delete', `/groups/${target.id}/membership`, undefined, 409);
  await owner.request('post', `/groups/${target.id}/transfer`, { userId: member.user.id });
  assert.equal(await M.Membership.countDocuments({ group: target.id, role: 'owner' }), 1);
  assert.equal(String((await M.Group.findById(target.id)).owner), member.user.id);
  assert.equal((await M.Membership.findOne({ group: target.id, user: owner.user.id })).role, 'moderator');
  await denied(owner, 'delete', `/groups/${target.id}`);
  await member.request('delete', `/groups/${target.id}`);
  await member.request('get', `/groups/${target.slug}`, undefined, 404);
});

test('group moderation can inspect blocked posts but cannot ordinarily interact across the block', async () => {
  const owner = await user();
  const member = await user();
  const target = await group(owner);
  await join(owner, member, target);
  const item = await post(member, { visibility: 'group', groupId: target.id });
  await member.request('put', `/users/${owner.user.id}/block`);
  const visible = await owner.request('get', `/posts/${item.id}`);
  assert.equal(visible.body.data.canModerate, true);
  await denied(owner, 'put', `/posts/${item.id}/like`);
  await denied(owner, 'post', `/posts/${item.id}/comments`, { body: 'Ordinary blocked interaction.' });
  await owner.request('delete', `/posts/${item.id}`);
  assert.equal((await M.Post.findById(item.id)).deleted, true);
});

test('demo personas cannot change account settings or mutate curated source content', async () => {
  const regular = await user();
  const demoAccount = await M.User.create({ name: 'Maya Demo', username: 'maya', email: 'maya@example.test', passwordHash: 'unused-demo-password', isDemo: true, seedKey: 'user:maya' });
  const curated = await M.Post.create({ author: demoAccount._id, title: 'Curated build log', body: 'Protected sample content', visibility: 'public', seedKey: 'post:curated' });
  const demo = await browser();
  await demo.request('post', '/auth/demo', { persona: 'maya' });
  await denied(demo, 'patch', '/users/me', { name: 'Changed demo' });
  await denied(demo, 'patch', `/posts/${curated.id}`, { body: 'Changed seed' });
  await denied(demo, 'delete', `/posts/${curated.id}`);
  const own = await post(demo);
  await demo.request('patch', `/posts/${own.id}`, { body: 'Editing newly created demo content is allowed.' });
  await demo.request('put', `/posts/${(await post(regular)).id}/like`);
});

test('pagination does not leak inaccessible private posts or duplicate accessible results', async () => {
  const owner = await user();
  const viewer = await user();
  const target = await group(owner);
  const drafts = [];
  for (let index = 0; index < 32; index++) drafts.push({ author: owner.user.id, title: `Public item ${index}`, body: 'Visible to visitors', visibility: 'public' });
  for (let index = 0; index < 30; index++) drafts.push({ author: owner.user.id, title: `Private item ${index}`, body: 'Group confidential content', visibility: 'group', group: target.id });
  await M.Post.insertMany(drafts);
  const first = await viewer.request('get', '/posts');
  assert.equal(first.body.data.items.length, 20);
  assert.ok(first.body.data.nextCursor);
  const second = await viewer.request('get', `/posts?cursor=${first.body.data.nextCursor}`);
  const all = [...first.body.data.items, ...second.body.data.items];
  assert.equal(all.length, 32);
  assert.equal(new Set(all.map(item => item.id)).size, 32);
  assert.ok(all.every(item => item.visibility === 'public'));
});

test('production startup rejects insecure origin, weak secrets and local data adapters', async () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const options = { mongoUri: database.getUri(), sessionSecret: 'x'.repeat(48), origin: 'https://codeial.example', uploadsMode: 'local', mailMode: 'local' };
    await assert.rejects(createApp({ ...options, sessionSecret: 'weak' }), /SESSION_SECRET/);
    await assert.rejects(createApp({ ...options, origin: 'http://codeial.example' }), /HTTPS/);
    await assert.rejects(createApp(options), /Production requires/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('upload quotas reject before processing and deleting an unused image restores allowance', async () => {
  const owner = await user();
  const stranger = await user();
  const oversized = await M.Media.create({ owner: owner.user.id, storage: 'local', storageKey: 'quota-fixture.webp', size: 100 * 1024 * 1024 });
  const rejected = await owner.request('post', '/media', {}, 413);
  assert.equal(rejected.body.error.code, 'UPLOAD_QUOTA');
  await M.Media.deleteOne({ _id: oversized._id });
  const unused = await upload(owner);
  await stranger.request('delete', `/media/${unused.id}`, undefined, 404);
  assert.ok(await M.Media.exists({ _id: unused.id }));
  await owner.request('delete', `/media/${unused.id}`);
  assert.equal(await M.Media.exists({ _id: unused.id }), null);
  await owner.agent.get(unused.url).expect(404);

  const attached = await upload(owner);
  await post(owner, { mediaIds: [attached.id] });
  await owner.request('delete', `/media/${attached.id}`, undefined, 404);
  const avatar = await upload(owner);
  await owner.request('patch', '/users/me', { avatarUrl: avatar.url });
  await owner.request('delete', `/media/${avatar.id}`, undefined, 409);
  await M.Media.insertMany(Array.from({ length: 10 }, (_, index) => ({ owner: owner.user.id, storage: 'local', storageKey: `pending-${index}.webp`, size: 100 })));
  assert.equal((await owner.request('post', '/media', {}, 413)).body.error.code, 'UPLOAD_QUOTA');
  const pending = await M.Media.findOne({ storageKey: 'pending-0.webp' });
  await owner.request('delete', `/media/${pending.id}`);
  await upload(owner);
});

function socketEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`Timed out waiting for socket event ${event}`)); }, 5000);
    const receive = value => { cleanup(); resolve(value); };
    const failed = error => { cleanup(); reject(error); };
    function cleanup() { clearTimeout(timer); socket.off(event, receive); if (event !== 'connect_error') socket.off('connect_error', failed); }
    socket.once(event, receive);
    if (event !== 'connect_error') socket.once('connect_error', failed);
  });
}

async function liveSocket(client, t) {
  const socket = connectSocket(socketOrigin, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Cookie: client.cookie, Origin: origin } });
  t.after(() => socket.disconnect());
  const connected = socketEvent(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

async function noNotification(socket, recipient, entry) {
  const notices = [];
  const record = value => notices.push(value);
  socket.on('notification', record);
  await app.locals.emitNotification(recipient, entry);
  const flushed = socketEvent(socket, 'test:flush');
  sockets.to(`user:${recipient}`).emit('test:flush');
  await flushed;
  socket.off('notification', record);
  assert.deepEqual(notices, [], 'Inaccessible notifications must not be pushed');
}

test('live notifications contain only an identifier and recheck private membership and blocks', async t => {
  const owner = await user();
  const member = await user();
  const target = await group(owner);
  await join(owner, member, target);
  const item = await post(owner, { visibility: 'group', groupId: target.id });
  const socket = await liveSocket(member, t);
  const entry = await M.Notification.create({ user: member.user.id, actor: owner.user.id, post: item.id, group: target.id, kind: 'post_like', dedupeKey: 'private-notice-fixture' });
  const received = socketEvent(socket, 'notification');
  await app.locals.emitNotification(member.user.id, entry.id);
  assert.deepEqual(await received, { id: entry.id });
  await member.request('delete', `/groups/${target.id}/membership`);
  await noNotification(socket, member.user.id, entry.id);
  const publicPost = await post(owner);
  const publicEntry = await M.Notification.create({ user: member.user.id, actor: owner.user.id, post: publicPost.id, kind: 'post_like', dedupeKey: 'public-notice-fixture' });
  await member.request('put', `/users/${owner.user.id}/block`);
  await noNotification(socket, member.user.id, publicEntry.id);
});

test('switching accounts and signing out disconnect the old authenticated socket', async t => {
  const first = await user();
  const second = await user();
  const socket = await liveSocket(first, t);
  const disconnected = socketEvent(socket, 'disconnect');
  await first.request('post', '/auth/login', second.account);
  await disconnected;
  assert.equal(socket.connected, false);
  const replacement = await liveSocket(first, t);
  const signedOut = socketEvent(replacement, 'disconnect');
  await first.request('post', '/auth/logout', {});
  await signedOut;
  assert.equal(replacement.connected, false);
});

test('expired or revoked persisted sessions cannot receive further socket notifications', async t => {
  const recipient = await user();
  const actor = await user();
  const item = await post(actor);
  const entry = await M.Notification.create({ user: recipient.user.id, actor: actor.user.id, post: item.id, kind: 'post_like', dedupeKey: 'expiry-notice-fixture' });
  const socket = await liveSocket(recipient, t);
  await M.User.updateOne({ _id: recipient.user.id }, { $inc: { sessionVersion: 1 } });
  const disconnected = socketEvent(socket, 'disconnect');
  await app.locals.emitNotification(recipient.user.id, entry.id);
  await disconnected;
  await recipient.request('post', '/auth/login', recipient.account);
  const fresh = await liveSocket(recipient, t);
  await mongoose.connection.collection('sessions').updateMany({}, { $set: { expires: new Date(Date.now() - 60_000) } });
  const expired = socketEvent(fresh, 'disconnect');
  await app.locals.emitNotification(recipient.user.id, entry.id);
  await expired;
  assert.equal(fresh.connected, false);
});

const projectPayload = (mediaIds = []) => ({ title: 'Integration showcase', description: 'A project created to verify image access and lifecycle.', stack: ['React', 'Node.js'], mediaIds });

test('project screenshots require ownership and cannot reuse post, project or avatar images', async () => {
  const owner = await user();
  const stranger = await user();
  const image = await upload(owner);
  await stranger.request('post', '/projects', projectPayload([image.id]), 400);
  const project = (await owner.request('post', '/projects', projectPayload([image.id]), 201)).body.data;
  assert.deepEqual(project.images, [{ id: image.id, url: image.url }]);
  assert.equal(String((await M.Media.findById(image.id)).project), project.id);
  await supertest(app).get(image.url).expect(200);
  await owner.request('post', '/posts', { title: 'Reused screenshot', body: 'Must not expose attached media twice.', mediaIds: [image.id] }, 400);
  await owner.request('post', '/projects', projectPayload([image.id]), 400);
  await owner.request('patch', '/users/me', { avatarUrl: image.url }, 400);
  await owner.request('delete', `/media/${image.id}`, undefined, 404);
  await stranger.request('patch', `/projects/${project.id}`, { mediaIds: [] }, 404);

  const privateImage = await upload(owner);
  const privateGroup = await group(owner);
  await post(owner, { groupId: privateGroup.id, visibility: 'group', mediaIds: [privateImage.id] });
  await owner.request('post', '/projects', projectPayload([privateImage.id]), 400);
  await supertest(app).get(privateImage.url).expect(404);
  const avatar = await upload(owner);
  await owner.request('patch', '/users/me', { avatarUrl: avatar.url });
  await owner.request('post', '/projects', projectPayload([avatar.id]), 400);
});

test('project image replacement is explicit and current access follows blocks, deletion and owner status', async () => {
  const owner = await user();
  const viewer = await user();
  const first = await upload(owner);
  const second = await upload(owner);
  const project = (await owner.request('post', '/projects', projectPayload([first.id]), 201)).body.data;
  const retained = (await owner.request('patch', `/projects/${project.id}`, { description: 'Editing text must retain the existing screenshot.' })).body.data;
  assert.equal(retained.images[0].id, first.id);
  const normalized = (await owner.request('patch', `/projects/${project.id}`, { mediaIds: [first.id.toUpperCase()] })).body.data;
  assert.equal(normalized.images[0].id, first.id);
  assert.equal(String((await M.Media.findById(first.id)).project), project.id);
  const replaced = (await owner.request('patch', `/projects/${project.id}`, { mediaIds: [second.id] })).body.data;
  assert.deepEqual(replaced.images.map(image => image.id), [second.id]);
  assert.equal((await M.Media.findById(first.id)).project, null);
  await supertest(app).get(first.url).expect(404);
  await owner.agent.get(first.url).expect(200);
  await owner.request('delete', `/media/${first.id}`);
  await viewer.agent.get(second.url).expect(200);
  await viewer.request('put', `/users/${owner.user.id}/block`);
  await viewer.agent.get(second.url).expect(404);
  await viewer.request('get', `/projects/${project.slug}`, undefined, 404);
  await viewer.request('delete', `/users/${owner.user.id}/block`);
  await viewer.agent.get(second.url).expect(200);
  await M.User.updateOne({ _id: owner.user.id }, { $set: { disabled: true } });
  await supertest(app).get(second.url).expect(404);
  await M.User.updateOne({ _id: owner.user.id }, { $set: { disabled: false } });
  await owner.request('delete', `/projects/${project.id}`);
  await supertest(app).get(second.url).expect(404);
});

test('competing showcases cannot claim the same upload', async () => {
  const owner = await user();
  const image = await upload(owner);
  const responses = await Promise.all([0, 1].map(index => owner.request('post', '/projects', { ...projectPayload([image.id]), title: `Concurrent showcase ${index}` }, null)));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.ok(responses.some(response => [400, 409].includes(response.status)));
  assert.equal(await M.Project.countDocuments({ media: image.id }), 1);
  const binding = await M.Media.findById(image.id);
  const winner = responses.find(response => response.status === 201).body.data;
  assert.equal(String(binding.project), winner.id);
  await supertest(app).get(image.url).expect(200);
});

test('administrator provisioning requires a verified ordinary account and revokes prior sessions', async () => {
  const { parseUsername, promoteAdmin } = require('../scripts/create-admin');
  assert.equal(parseUsername(['--username', 'Some_User']), 'some_user');
  for (const args of [[], ['--email', 'x@example.test'], ['--username', 'good', '--force'], ['--username', '../bad']])
    assert.throws(() => parseUsername(args), /Usage/);
  const account = await user();
  await assert.rejects(promoteAdmin(account.user.username), /email-verified/);
  assert.equal((await M.User.findById(account.user.id)).role, 'user');
  await M.User.updateOne({ _id: account.user.id }, { $set: { emailVerified: true, isDemo: true } });
  await assert.rejects(promoteAdmin(account.user.username), /non-demo/);
  await M.User.updateOne({ _id: account.user.id }, { $set: { isDemo: false, disabled: true } });
  await assert.rejects(promoteAdmin(account.user.username), /active/);
  await M.User.updateOne({ _id: account.user.id }, { $set: { disabled: false } });
  await M.User.updateOne({ _id: account.user.id }, { $set: { seedKey: 'fictional-account' } });
  await assert.rejects(promoteAdmin(account.user.username), /non-demo/);
  await M.User.updateOne({ _id: account.user.id }, { $unset: { seedKey: '' } });
  assert.deepEqual(await promoteAdmin(account.user.username), { username: account.user.username, changed: true });
  const promoted = await M.User.findById(account.user.id);
  assert.equal(promoted.role, 'admin');
  assert.equal(promoted.sessionVersion, 1);
  assert.equal((await account.request('get', '/auth/session')).body.data.user, null);
  assert.deepEqual(await promoteAdmin(account.user.username), { username: account.user.username, changed: false });
  assert.equal((await M.User.findById(account.user.id)).sessionVersion, 1);
});

test('Explore remains public for signed-in members while Home and explicit group pages retain private access', async () => {
  const author = await user();
  const viewer = await user();
  await friends(author, viewer);
  const target = await group(author);
  await join(author, viewer, target);
  const publicPost = await post(author, { title: 'Public discovery entry' });
  const friendPost = await post(author, { title: 'Private friendship entry', visibility: 'friends' });
  const groupPost = await post(author, { title: 'Private community entry', visibility: 'group', groupId: target.id });
  const ownPrivate = await post(viewer, { title: 'Private personal entry', visibility: 'friends' });
  const explore = ids(await viewer.request('get', '/posts?feed=explore'));
  assert.ok(explore.includes(publicPost.id));
  for (const item of [friendPost, groupPost, ownPrivate]) assert.ok(!explore.includes(item.id));
  assert.deepEqual(ids(await viewer.request('get', '/posts?feed=explore&search=Private')), []);
  const home = ids(await viewer.request('get', '/posts?feed=home'));
  for (const item of [friendPost, groupPost, ownPrivate]) assert.ok(home.includes(item.id));
  assert.ok(ids(await viewer.request('get', `/posts?group=${target.id}`)).includes(groupPost.id));
});
