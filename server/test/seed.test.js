const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const M = require('../src/models');
const { seedDemo } = require('../scripts/seed');

const scratchRoot = path.resolve(__dirname, '../../.local/test-runtime');
const previous = { uploads: process.env.UPLOADS_MODE, media: process.env.LOCAL_MEDIA_DIR };
let database, scratch;

before(async () => {
  await fs.mkdir(scratchRoot, { recursive: true });
  scratch = await fs.mkdtemp(path.join(scratchRoot, 'seed-'));
  process.env.UPLOADS_MODE = 'local';
  process.env.LOCAL_MEDIA_DIR = path.join(scratch, 'media');
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri('codeial_seed_guard'));
}, { timeout: 180_000 });

after(async () => {
  await mongoose.disconnect();
  await database?.stop();
  for (const [key, value] of [['UPLOADS_MODE', previous.uploads], ['LOCAL_MEDIA_DIR', previous.media]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  if (scratch) {
    assert.equal(path.dirname(path.resolve(scratch)), scratchRoot);
    assert.ok(path.basename(scratch).startsWith('seed-'));
    await fs.rm(scratch, { recursive: true, force: true });
  }
});

test('seed and reset refuse a database without the explicit demo suffix before writing', async () => {
  await assert.rejects(seedDemo(), /dedicated database.*_demo/);
  await assert.rejects(seedDemo({ reset: true }), /dedicated database.*_demo/);
  assert.equal(await M.User.countDocuments(), 0);
  assert.equal(await M.Post.countDocuments(), 0);
});

test('demo data is complete, repeatable and reset preserves genuine users and posts', { timeout: 120_000 }, async () => {
  await mongoose.disconnect();
  await mongoose.connect(database.getUri('codeial_seed_test_demo'));
  await seedDemo();
  const counts = async () => Object.fromEntries(await Promise.all(Object.entries(M).map(async ([name, model]) => [name, await model.countDocuments()])));
  const baseline = await counts();
  assert.equal(baseline.User, 40);
  assert.equal(baseline.Group, 8);
  assert.equal(baseline.Project, 20);
  assert.equal(baseline.Post, 180);
  assert.ok(baseline.Comment >= 500);
  assert.ok(baseline.Like >= 1000);
  assert.equal(await M.Group.countDocuments({ visibility: 'private' }), 2);
  assert.ok(await M.Post.exists({ visibility: 'friends' }));
  assert.ok(await M.Post.exists({ type: 'help', status: 'solved' }));
  assert.ok(await M.Membership.exists({ status: 'pending' }));
  for (const group of await M.Group.find()) {
    assert.equal(await M.Membership.countDocuments({ group: group._id, role: 'owner', user: group.owner, status: 'active' }), 1);
  }
  const first = await M.Post.findOne({ seedKey: 'post:0' });
  assert.ok(first);
  const last = await M.Post.findOne({ seedKey: 'post:179' });
  assert.ok(first.createdAt.getTime() - last.createdAt.getTime() > 4 * 24 * 60 * 60 * 1000,
    'The seed must preserve its chronology so recent image posts lead the feed');
  const originalTitle = first.title;
  first.title = 'Keep an intentional local demo edit';
  await first.save();
  const realUser = await M.User.create({ name: 'Real local user', username: 'genuine_user', email: 'genuine@example.test', passwordHash: 'test-fixture-only' });
  const realPost = await M.Post.create({ author: realUser._id, title: 'My own content', body: 'This must survive the demo reset.' });
  await seedDemo();
  assert.deepEqual(await counts(), { ...baseline, User: baseline.User + 1, Post: baseline.Post + 1 });
  assert.equal((await M.Post.findById(first._id)).title, 'Keep an intentional local demo edit');
  const media = await M.Media.findOne({ post: { $ne: null } });
  assert.ok(media?.post);
  assert.ok((await fs.stat(path.join(process.env.LOCAL_MEDIA_DIR, media.storageKey))).size > 0);
  await seedDemo({ reset: true });
  assert.deepEqual(await counts(), { ...baseline, User: baseline.User + 1, Post: baseline.Post + 1 });
  assert.equal((await M.Post.findById(first._id)).title, originalTitle);
  assert.equal((await M.Post.findById(realPost._id)).body, 'This must survive the demo reset.');
  assert.equal((await M.User.findById(realUser._id)).username, 'genuine_user');
});
