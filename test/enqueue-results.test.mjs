import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enqueueArchives } from '../lib/bili.js';
import { handleSourceCallback } from '../lib/interactions.js';
import { sqlite, setFetch, messages } from './support/sdk.mjs';

function prepare(count) {
  sqlite.exec('DELETE FROM source_jobs'); messages.length = 0;
  const bvids = Array.from({ length: count }, (_, i) => `BV${i}`);
  sqlite.prepare('INSERT INTO source_jobs VALUES (1, 1, 1, ?, ?, ?, ?, ?, 0, 8, ?, unixepoch())')
    .run('series', '1', 'https://example.com', JSON.stringify(bvids), count, 'active');
}
function respond(outcomes) {
  let index = 0;
  setFetch(async () => {
    const outcome = outcomes[index++];
    if (outcome === 'error') throw new Error('network failure');
    return { ok: true, json: async () => ({ success: outcome === 'accepted' }) };
  });
}
const callback = { id: 'callback', from: { id: 1 }, message: { chat: { id: 1 }, message_id: 1 } };
const state = () => sqlite.prepare('SELECT * FROM source_jobs WHERE id = 1').get();

test('enqueue classifies accepted, rejected and network error', async () => {
  respond(['accepted', 'rejected', 'error']);
  const { results } = await enqueueArchives(['BV0', 'BV1', 'BV2']);
  assert.deepEqual(results.map(({ accepted, rejected }) => ({ accepted, rejected })), [
    { accepted: true, rejected: false }, { accepted: false, rejected: true }, { accepted: false, rejected: false },
  ]);
  assert.match(results[2].error, /network failure/);
});
for (const outcomes of [
  ['accepted', 'accepted'], ['accepted', 'rejected'], ['rejected', 'rejected'],
  ['accepted', 'error'], ['error', 'error'], ['rejected', 'error'],
]) {
  test(`batch ${outcomes.join(' + ')} ${outcomes.includes('error') ? 'rolls back' : 'confirms'}`, async () => {
    prepare(outcomes.length); respond(outcomes); await handleSourceCallback(callback, 1, 0);
    assert.equal(state().next_offset, outcomes.includes('error') ? 0 : 8);
    assert.equal(state().status, outcomes.includes('error') ? 'active' : 'complete');
  });
}
test('seven accepted and one error roll back; retry with duplicates confirms', async () => {
  prepare(8); respond([...Array(7).fill('accepted'), 'error']);
  await handleSourceCallback(callback, 1, 0); assert.equal(state().next_offset, 0);
  respond([...Array(7).fill('rejected'), 'accepted']);
  await handleSourceCallback(callback, 1, 0); assert.equal(state().status, 'complete');
});
