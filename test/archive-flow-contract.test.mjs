import assert from 'node:assert/strict';
import { test } from 'node:test';
import { looksLikeArchiveInput } from '../lib/archive-flow.js';
import { resolveB23Links } from '../lib/bili.js';
import { setFetch } from './support/sdk.mjs';

test('looksLikeArchiveInput: BV ID', () => {
  assert.equal(looksLikeArchiveInput('BV1xx411c7mD'), true);
});

test('looksLikeArchiveInput: av ID', () => {
  assert.equal(looksLikeArchiveInput('av123456'), true);
});

test('looksLikeArchiveInput: b23.tv short link', () => {
  assert.equal(looksLikeArchiveInput('https://b23.tv/abc123'), true);
});

test('looksLikeArchiveInput: b23.wtf short link', () => {
  assert.equal(looksLikeArchiveInput('https://b23.wtf/abc123'), true);
});

test('looksLikeArchiveInput: bili2233.cn short link', () => {
  assert.equal(looksLikeArchiveInput('https://bili2233.cn/abc123'), true);
});

test('looksLikeArchiveInput: bilibili.com URL', () => {
  assert.equal(looksLikeArchiveInput('https://www.bilibili.com/video/BV1xx411c7mD'), true);
});

test('looksLikeArchiveInput: plain text is false', () => {
  assert.equal(looksLikeArchiveInput('hello world'), false);
});

test('looksLikeArchiveInput: null/undefined is false', () => {
  assert.equal(looksLikeArchiveInput(null), false);
  assert.equal(looksLikeArchiveInput(undefined), false);
});

for (const [name, link] of [
  ['b23.tv', 'https://b23.tv/abc123'],
  ['b23.wtf', 'https://b23.wtf/xyz'],
  ['bili2233.cn', 'https://bili2233.cn/abc123'],
  ['bili2233.cn without scheme', 'bili2233.cn/abc123'],
]) {
  test(`short link resolution matches ${name}`, async () => {
    setFetch(async () => ({ ok: true, url: 'https://www.bilibili.com/video/BV1xx411c7mD' }));
    assert.equal(await resolveB23Links(`check ${link} out`), 'check https://www.bilibili.com/video/BV1xx411c7mD out');
  });
}
