import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  archiveIdentifier,
  archiveItemUrl,
  bvidLink,
  commandFromMessage,
  escapeHtml,
  isBvid,
  messageText,
  normaliseBvid,
  parseSafeInteger,
  sourceLabel,
} from '../lib/format.js';

test('escapeHtml escapes all five special characters', () => {
  // escapeHtml replaces & first, then <, >, ", '
  assert.equal(
    escapeHtml(`<a href="x">'&'</a>`),
    '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
  );
});

test('escapeHtml replaces & before other entities', () => {
  assert.equal(escapeHtml('&<'), '&amp;&lt;');
});

test('escapeHtml handles null/undefined', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('parseSafeInteger rejects non-numeric and unsafe', () => {
  assert.equal(parseSafeInteger('abc'), null);
  assert.equal(parseSafeInteger(''), null);
  assert.equal(parseSafeInteger('1.5'), null);
  assert.equal(parseSafeInteger('9999999999999999999999'), null);
});

test('parseSafeInteger accepts valid integers', () => {
  assert.equal(parseSafeInteger('42'), 42);
  assert.equal(parseSafeInteger('-1'), -1);
  assert.equal(parseSafeInteger('  100  '), 100);
});

test('isBvid validates BV format', () => {
  assert.equal(isBvid('BV1xx411c7mD'), true);
  assert.equal(isBvid('bv1xx411c7md'), false);
  assert.equal(isBvid('BV1xx411c7m'), false);
  assert.equal(isBvid(''), false);
});

test('normaliseBvid normalises case of prefix only', () => {
  // normaliseBvid only uppercases the "bv" prefix; the rest is preserved as-is.
  assert.equal(normaliseBvid('bv1xx411c7md'), 'BV1xx411c7md');
  assert.equal(normaliseBvid('BV1xx411c7mD'), 'BV1xx411c7mD');
  assert.equal(normaliseBvid('not-a-bvid'), null);
});

test('commandFromMessage parses commands', () => {
  assert.deepEqual(commandFromMessage({ text: '/help' }), { command: 'help', args: '' });
  assert.deepEqual(commandFromMessage({ text: '/setapi https://x.com/' }), {
    command: 'setapi',
    args: 'https://x.com/',
  });
  assert.deepEqual(commandFromMessage({ text: '/bili@mybot extra' }), {
    command: 'bili',
    args: 'extra',
  });
  assert.equal(commandFromMessage({ text: 'hello' }), null);
  assert.equal(commandFromMessage({ text: '' }), null);
  assert.equal(commandFromMessage({}), null);
});

test('messageText combines text and caption', () => {
  assert.equal(messageText({ text: 'hello' }), 'hello');
  assert.equal(messageText({ caption: 'cap' }), 'cap');
  assert.equal(messageText({}), '');
  assert.equal(
    messageText({ text: 'main', reply_to_message: { text: 'reply' } }, true),
    'main\nreply',
  );
});

test('archiveIdentifier produces expected format', () => {
  const id = archiveIdentifier('BV1xx411c7mD');
  assert.match(id, /^BiliBili-BV1xx411c7mD_p1-/);
});

test('archiveItemUrl is archive.org URL', () => {
  const url = archiveItemUrl('BV1xx411c7mD');
  assert.match(url, /^https:\/\/archive\.org\/details\//);
});

test('bvidLink is bilibili URL', () => {
  assert.equal(bvidLink('BV1xx411c7mD'), 'https://www.bilibili.com/video/BV1xx411c7mD');
});

test('sourceLabel maps known types', () => {
  assert.equal(sourceLabel('season'), 'collection');
  assert.equal(sourceLabel('favlist'), 'favourites list');
  assert.equal(sourceLabel('series'), 'series');
  assert.equal(sourceLabel('up_videos'), 'creator uploads');
  assert.equal(sourceLabel('unknown'), 'source');
});
