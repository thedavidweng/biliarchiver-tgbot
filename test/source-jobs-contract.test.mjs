import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveSourceBatch, releaseSourceBatch, confirmSourceBatch } from '../lib/source-jobs.js';
import { sqlite } from './support/sdk.mjs';

function makeJob(count) {
  sqlite.exec('DELETE FROM source_jobs');
  const bvids = Array.from({ length: count }, (_, i) => `BV${i}`);
  sqlite.prepare('INSERT INTO source_jobs VALUES (1, 1, 1, ?, ?, ?, ?, ?, 0, 8, ?, 0)')
    .run('series', '1', 'https://example.com', JSON.stringify(bvids), count, 'active');
}
function state() { return sqlite.prepare('SELECT * FROM source_jobs WHERE id = 1').get(); }
const reserve = (offset) => reserveSourceBatch(1, offset);
const release = (offset) => releaseSourceBatch(1, offset);
const confirm = () => confirmSourceBatch(1);

test('reserve advances offset by batchSize and slices the batch', async () => {
  makeJob(20); const job = await reserve(0);
  assert.equal(job.reservedStart, 0); assert.equal(job.reservedEnd, 8);
  assert.equal(job.bvids.length, 8); assert.equal(state().next_offset, 8);
});
test('reserve final partial batch exceeds totalCount', async () => {
  makeJob(10); await reserve(0); const job = await reserve(8);
  assert.equal(state().next_offset, 16); assert.equal(job.reservedStart, 8);
  assert.equal(job.reservedEnd, 10); assert.deepEqual(job.bvids, ['BV8', 'BV9']);
});
test('double click fails and next offset succeeds', async () => {
  makeJob(20); assert.ok(await reserve(0)); assert.equal(await reserve(0), null);
  const job = await reserve(8); assert.equal(job.reservedStart, 8); assert.equal(job.bvids[0], 'BV8');
});
test('release rolls back both full and partial batches', async () => {
  makeJob(10); await reserve(0); await release(0); assert.equal(state().next_offset, 0);
  await reserve(0); await reserve(8); await release(8); assert.equal(state().next_offset, 8);
});
test('release does not overwrite a later reserve or a complete job', async () => {
  makeJob(20); await reserve(0); await reserve(8); await release(0); assert.equal(state().next_offset, 16);
  makeJob(8); await reserve(0); await confirm(); await release(0);
  assert.equal(state().next_offset, 8); assert.equal(state().status, 'complete');
});
test('confirm waits for all items, including partial final batch', async () => {
  makeJob(10); await reserve(0); await confirm(); assert.equal(state().status, 'active');
  await reserve(8); await confirm(); assert.equal(state().status, 'complete');
  makeJob(8); await reserve(0); await confirm(); assert.equal(state().status, 'complete');
});
test('failed batch can be retried with the same items', async () => {
  makeJob(20); const first = await reserve(0); await release(0); const retry = await reserve(0);
  assert.deepEqual(retry.bvids, first.bvids); assert.equal(retry.reservedStart, 0);
});
test('last batch can fail, roll back, retry and complete', async () => {
  makeJob(10); await reserve(0); await confirm(); const last = await reserve(8);
  await release(8); assert.equal(state().next_offset, 8); assert.equal(state().status, 'active');
  const retry = await reserve(8); assert.deepEqual(retry.bvids, last.bvids); await confirm();
  assert.equal(state().status, 'complete');
});
test('stale button fails after newer batch', async () => {
  makeJob(20); await reserve(0); await confirm(); await reserve(8); await confirm();
  assert.equal(state().status, 'active'); assert.equal(await reserve(0), null);
});
test('reserve, release and confirm update last activity', async () => {
  makeJob(8); await reserve(0); assert.ok(state().last_activity_at > 0);
  sqlite.exec('UPDATE source_jobs SET last_activity_at = 0'); await release(0); assert.ok(state().last_activity_at > 0);
  await reserve(0); sqlite.exec('UPDATE source_jobs SET last_activity_at = 0'); await confirm(); assert.ok(state().last_activity_at > 0);
});
