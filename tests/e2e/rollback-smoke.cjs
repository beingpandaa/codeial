// Usage: node tests/e2e/rollback-smoke.cjs .local/test-runtime/rollback-prior
// Exercises built frontend artifact restoration locally; it does not deploy or call cloud providers.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { smoke } = require('./production-smoke.cjs');

const root = path.resolve(__dirname, '../..');
const dist = path.join(root, 'client/dist');
const scratch = path.join(root, '.local/test-runtime');
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function manifest(directory, relative = '') {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) return manifest(directory, name);
    assert.ok(entry.isFile(), 'Build artifacts may not contain symbolic links');
    return [[name, crypto.createHash('sha256').update(await fs.readFile(path.join(directory, name))).digest('hex')]];
  }));
  return files.flat().sort(([a], [b]) => a.localeCompare(b));
}

async function main() {
  assert.ok(process.argv[2], 'Supply a saved prior build inside .local/test-runtime');
  const prior = await fs.realpath(path.resolve(root, process.argv[2]));
  assert.ok(prior.toLowerCase().startsWith((await fs.realpath(scratch)).toLowerCase() + path.sep), 'Prior build must stay inside the test runtime directory');
  assert.ok(same(await fs.realpath(dist), dist), 'Refuse to replace a redirected dist directory');
  await fs.access(path.join(prior, 'index.html'));
  const latest = await fs.mkdtemp(path.join(scratch, 'rollback-latest-'));
  await fs.cp(dist, latest, { recursive: true });
  const expected = await manifest(latest);
  const latestResult = await smoke();
  let priorResult;
  try {
    assert.ok(same(dist, path.join(root, 'client/dist')));
    await fs.rm(dist, { recursive: true, force: true });
    await fs.cp(prior, dist, { recursive: true });
    priorResult = await smoke();
  } finally {
    assert.ok(same(dist, path.join(root, 'client/dist')));
    await fs.rm(dist, { recursive: true, force: true });
    await fs.cp(latest, dist, { recursive: true });
    assert.deepEqual(await manifest(dist), expected, 'Latest build must be restored byte for byte');
  }
  console.log(JSON.stringify({ latest: latestResult, restoredPrior: priorResult, latestRestoredExactly: true, cloudRollbackTested: false }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
