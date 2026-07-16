// Contract test for enqueueArchives result classification.
//
// lib/bili.js depends on the Serverless `sdk` module, so we test the result
// classification logic as a contract: the caller (interactions.js / archive-flow.js)
// distinguishes three outcomes per item:
//   - accepted: API returned { success: true }
//   - rejected: API returned { success: false } (definitive, e.g. already queued)
//   - error:    network/server failure (must retry)
//
// The caller's policy:
//   - Any error in the batch -> roll back, show retry button.
//   - All accepted or rejected (no error) -> confirm, advance.
//   - Rejected items are NOT errors — they are definitive API responses.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Model of the classification logic from enqueueArchives.
function classifyResult(payload, threwError) {
  if (threwError) {
    return { accepted: false, rejected: false, error: 'network failure' };
  }
  return {
    accepted: payload?.success === true,
    rejected: payload?.success !== true,
  };
}

// Model of the caller's batch decision policy.
// Production (lib/interactions.js, lib/archive-flow.js) rolls back ONLY on
// network errors. An all-rejected batch (e.g. all duplicates already queued)
// is a definitive API response and is confirmed/advanced — rolling it back
// would create an infinite retry loop of already-queued items.
function batchDecision(results) {
  const hasErrors = results.some((result) => result.error);
  if (hasErrors) return { action: 'rollback', reason: 'network_error' };

  return { action: 'confirm' };
}

test('accepted item: success=true', () => {
  const result = classifyResult({ success: true }, false);
  assert.equal(result.accepted, true);
  assert.equal(result.rejected, false);
  assert.equal(result.error, undefined);
});

test('rejected item: success=false (already queued)', () => {
  const result = classifyResult({ success: false }, false);
  assert.equal(result.accepted, false);
  assert.equal(result.rejected, true);
  assert.equal(result.error, undefined);
});

test('error item: network failure', () => {
  const result = classifyResult(null, true);
  assert.equal(result.accepted, false);
  assert.equal(result.rejected, false);
  assert.equal(result.error, 'network failure');
});

test('batch with all accepted -> confirm', () => {
  const results = [
    classifyResult({ success: true }, false),
    classifyResult({ success: true }, false),
  ];
  assert.equal(batchDecision(results).action, 'confirm');
});

test('batch with accepted + rejected (no error) -> confirm', () => {
  const results = [
    classifyResult({ success: true }, false),
    classifyResult({ success: false }, false),
  ];
  assert.equal(batchDecision(results).action, 'confirm');
});

test('batch with accepted + error -> rollback (NOT confirm)', () => {
  // This is the key case: 7 accepted, 1 network error.
  // Must NOT confirm — the error item must be retried.
  const results = [
    classifyResult({ success: true }, false),
    classifyResult({ success: true }, false),
    classifyResult(null, true), // network error
  ];
  assert.equal(batchDecision(results).action, 'rollback');
  assert.equal(batchDecision(results).reason, 'network_error');
});

test('batch with all rejected -> confirm (definitive, no retry)', () => {
  // All items rejected (e.g. already queued duplicates). This is a definitive
  // API response, not a network error. Production confirms/advances — rolling
  // back would re-send already-queued items forever.
  const results = [
    classifyResult({ success: false }, false),
    classifyResult({ success: false }, false),
  ];
  assert.equal(batchDecision(results).action, 'confirm');
});

test('batch with all errors -> rollback', () => {
  const results = [
    classifyResult(null, true),
    classifyResult(null, true),
  ];
  assert.equal(batchDecision(results).action, 'rollback');
  assert.equal(batchDecision(results).reason, 'network_error');
});

test('batch with rejected + error -> rollback (error takes priority)', () => {
  const results = [
    classifyResult({ success: false }, false),
    classifyResult(null, true),
  ];
  assert.equal(batchDecision(results).action, 'rollback');
  assert.equal(batchDecision(results).reason, 'network_error');
});

test('retry after rollback: previously accepted items get rejected (idempotent)', () => {
  // On retry, the API returns success=false for already-accepted items.
  // The batch now has all rejected (no errors), so it confirms.
  const retryResults = [
    classifyResult({ success: false }, false), // was accepted, now rejected
    classifyResult({ success: true }, false),  // the previously-error item, now accepted
  ];
  assert.equal(batchDecision(retryResults).action, 'confirm');
});

test('7 accepted + 1 error scenario: rollback, retry, confirm', () => {
  // First attempt: 7 accepted, 1 network error
  const firstAttempt = [
    ...Array.from({ length: 7 }, () => classifyResult({ success: true }, false)),
    classifyResult(null, true),
  ];
  assert.equal(batchDecision(firstAttempt).action, 'rollback');

  // Retry: 7 now rejected (idempotent), 1 now accepted
  const retry = [
    ...Array.from({ length: 7 }, () => classifyResult({ success: false }, false)),
    classifyResult({ success: true }, false),
  ];
  assert.equal(batchDecision(retry).action, 'confirm');
});
