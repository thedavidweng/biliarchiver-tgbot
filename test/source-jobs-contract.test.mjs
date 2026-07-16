// Contract test for the source-job offset lifecycle.
//
// The real lib/source-jobs.js depends on the Serverless `sdk` module which is
// not available in CI. This test models the EXACT behavior of the real SQL:
//
// - reserveSourceBatch advances nextOffset by batchSize (NOT clamped to
//   totalCount), so for the final partial batch nextOffset > totalCount.
// - reserveSourceBatch uses WHERE next_offset = expectedOffset (optimistic
//   lock from the callback data), so each button can only reserve once.
// - releaseSourceBatch rolls back to expectedOffset only if next_offset =
//   expectedOffset + batch_size (this click's reserve is still the latest).
// - confirmSourceBatch marks complete only when next_offset >= total_count.
//
// This test caught the original bug where the model clamped nextOffset and
// the real code did not, causing releaseSourceBatch to fail on the last batch.
import assert from 'node:assert/strict';
import { test } from 'node:test';

const BATCH_SIZE = 8;

function makeJob(totalCount, bvids) {
  return {
    id: 1,
    bvids,
    totalCount,
    nextOffset: 0,
    batchSize: BATCH_SIZE,
    status: 'active',
    lastActivityAt: 1000,
  };
}

// Accurate model of reserveSourceBatch(id, expectedOffset).
// Mirrors the real SQL: SET next_offset = next_offset + batch_size
// WHERE id, status='active', next_offset = expectedOffset, next_offset < total_count.
function reserve(job, expectedOffset) {
  if (
    job.status !== 'active' ||
    job.nextOffset !== expectedOffset ||
    job.nextOffset >= job.totalCount
  ) {
    return null;
  }
  // Real SQL: next_offset = next_offset + batch_size (NOT clamped)
  job.nextOffset = job.nextOffset + job.batchSize;
  job.lastActivityAt++;
  const start = expectedOffset;
  const end = Math.min(job.nextOffset, job.totalCount);
  return {
    ...job,
    reservedStart: start,
    reservedEnd: end,
    bvids: job.bvids.slice(start, end),
  };
}

// Accurate model of releaseSourceBatch(id, expectedOffset).
// Mirrors the real SQL: SET next_offset = expectedOffset
// WHERE next_offset = expectedOffset + batch_size.
function release(job, expectedOffset) {
  if (
    job.status === 'active' &&
    job.nextOffset === expectedOffset + job.batchSize
  ) {
    job.nextOffset = expectedOffset;
    job.lastActivityAt++;
  }
}

// Accurate model of confirmSourceBatch(id).
// Mirrors the real SQL: SET status='complete'
// WHERE status='active' AND next_offset >= total_count.
function confirm(job) {
  if (job.status === 'active' && job.nextOffset >= job.totalCount) {
    job.status = 'complete';
    job.lastActivityAt++;
  }
}

// --- Basic reserve ---

test('reserve advances offset by batchSize (not clamped)', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const reserved = reserve(job, 0);
  assert.equal(reserved.reservedStart, 0);
  assert.equal(reserved.reservedEnd, 8);
  assert.equal(reserved.bvids.length, 8);
  assert.equal(job.nextOffset, 8); // 0 + 8
});

test('reserve on final partial batch: nextOffset exceeds totalCount', () => {
  const bvids = Array.from({ length: 10 }, (_, i) => `BV${i}`);
  const job = makeJob(10, bvids);
  reserve(job, 0); // first batch: 0 -> 8
  const reserved = reserve(job, 8); // second batch: 8 -> 16
  assert.equal(job.nextOffset, 16); // NOT clamped to 10
  assert.equal(reserved.reservedStart, 8);
  assert.equal(reserved.reservedEnd, 10); // clamped for slicing only
  assert.equal(reserved.bvids.length, 2); // only 2 items in the last batch
  assert.deepEqual(reserved.bvids, ['BV8', 'BV9']);
});

// --- Double-click safety ---

test('second click of same button fails (expectedOffset mismatch)', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const r1 = reserve(job, 0);
  assert.ok(r1);
  const r2 = reserve(job, 0); // same expectedOffset
  assert.equal(r2, null); // fails because nextOffset is now 8, not 0
});

test('next button has different expectedOffset and succeeds', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const r1 = reserve(job, 0);
  const r2 = reserve(job, 8); // new button encodes offset 8
  assert.ok(r1);
  assert.ok(r2);
  assert.equal(r2.reservedStart, 8);
  assert.equal(r2.bvids[0], 'BV8');
});

// --- Release (rollback) ---

test('release rolls back offset after failure', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const reserved = reserve(job, 0);
  assert.equal(job.nextOffset, 8);
  release(job, 0);
  assert.equal(job.nextOffset, 0);
});

test('release on final partial batch: condition matches (nextOffset = expectedOffset + batchSize)', () => {
  const bvids = Array.from({ length: 10 }, (_, i) => `BV${i}`);
  const job = makeJob(10, bvids);
  reserve(job, 0); // 0 -> 8
  const reserved = reserve(job, 8); // 8 -> 16
  assert.equal(job.nextOffset, 16);
  // Release should work: 16 = 8 + 8 (expectedOffset + batchSize)
  release(job, 8);
  assert.equal(job.nextOffset, 8); // rolled back
});

test('release is no-op if a later click already advanced offset', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const r1 = reserve(job, 0); // 0 -> 8
  reserve(job, 8); // 8 -> 16
  // Try to release r1's batch: 16 != 0 + 8 = 8, so no-op
  release(job, 0);
  assert.equal(job.nextOffset, 16); // unchanged
});

test('release on complete job is no-op', () => {
  const bvids = Array.from({ length: 8 }, (_, i) => `BV${i}`);
  const job = makeJob(8, bvids);
  reserve(job, 0); // 0 -> 8
  confirm(job); // complete
  release(job, 0); // should be no-op (status != active)
  assert.equal(job.nextOffset, 8);
  assert.equal(job.status, 'complete');
});

// --- Confirm ---

test('confirm marks complete when nextOffset >= totalCount (full batch)', () => {
  const bvids = Array.from({ length: 8 }, (_, i) => `BV${i}`);
  const job = makeJob(8, bvids);
  reserve(job, 0); // 0 -> 8
  confirm(job);
  assert.equal(job.status, 'complete');
});

test('confirm marks complete when nextOffset > totalCount (partial last batch)', () => {
  const bvids = Array.from({ length: 10 }, (_, i) => `BV${i}`);
  const job = makeJob(10, bvids);
  reserve(job, 0); // 0 -> 8
  confirm(job); // 8 < 10, stays active
  assert.equal(job.status, 'active');
  reserve(job, 8); // 8 -> 16
  confirm(job); // 16 >= 10, complete
  assert.equal(job.status, 'complete');
});

test('confirm does not mark complete when items remain', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  reserve(job, 0); // 0 -> 8
  confirm(job); // 8 < 20
  assert.equal(job.status, 'active');
});

// --- Full lifecycle ---

test('full lifecycle: reserve, fail, release, retry gets same batch', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  const r1 = reserve(job, 0);
  release(job, 0); // rollback
  const r2 = reserve(job, 0); // retry same button
  assert.ok(r2);
  assert.equal(r2.reservedStart, 0);
  assert.deepEqual(r2.bvids, r1.bvids);
});

test('full lifecycle: all batches succeed, job completes', () => {
  const bvids = Array.from({ length: 10 }, (_, i) => `BV${i}`);
  const job = makeJob(10, bvids);
  const r1 = reserve(job, 0);
  confirm(job); // 8 < 10, active
  assert.equal(job.status, 'active');
  const r2 = reserve(job, 8);
  confirm(job); // 16 >= 10, complete
  assert.equal(job.status, 'complete');
  assert.equal(r1.bvids.length, 8);
  assert.equal(r2.bvids.length, 2);
});

test('full lifecycle: last batch fails, rollback, retry succeeds', () => {
  const bvids = Array.from({ length: 10 }, (_, i) => `BV${i}`);
  const job = makeJob(10, bvids);
  reserve(job, 0); // 0 -> 8
  confirm(job); // active
  // Last batch (8 -> 16)
  const r2 = reserve(job, 8);
  assert.equal(r2.bvids.length, 2);
  // Simulate enqueue failure
  release(job, 8); // 16 -> 8
  assert.equal(job.nextOffset, 8);
  assert.equal(job.status, 'active');
  // Retry
  const r3 = reserve(job, 8);
  assert.ok(r3);
  assert.equal(r3.bvids.length, 2);
  assert.deepEqual(r3.bvids, ['BV8', 'BV9']);
  confirm(job);
  assert.equal(job.status, 'complete');
});

// --- Stale button ---

test('stale button (old expectedOffset) fails after newer button succeeded', () => {
  const bvids = Array.from({ length: 20 }, (_, i) => `BV${i}`);
  const job = makeJob(20, bvids);
  reserve(job, 0); // 0 -> 8, success
  confirm(job); // active
  reserve(job, 8); // 8 -> 16, success
  confirm(job); // complete (16 >= 20? no, 16 < 20, stays active)
  assert.equal(job.status, 'active');
  // User clicks old button (expectedOffset=0)
  const stale = reserve(job, 0);
  assert.equal(stale, null); // nextOffset is 16, not 0
});

// --- lastActivityAt ---

test('lastActivityAt updates on reserve, release, and confirm', () => {
  const bvids = Array.from({ length: 8 }, (_, i) => `BV${i}`);
  const job = makeJob(8, bvids);
  const initialActivity = job.lastActivityAt;
  reserve(job, 0);
  assert.equal(job.lastActivityAt, initialActivity + 1);
  release(job, 0);
  assert.equal(job.lastActivityAt, initialActivity + 2);
  reserve(job, 0);
  confirm(job);
  assert.equal(job.lastActivityAt, initialActivity + 4);
});
