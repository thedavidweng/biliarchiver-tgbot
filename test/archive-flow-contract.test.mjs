// Contract test for looksLikeArchiveInput and the short-link patterns.
// lib/archive-flow.js imports lib/bili.js which depends on `sdk`, so we
// re-implement the pure regex here as a contract test.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mirror of looksLikeArchiveInput from lib/archive-flow.js.
function looksLikeArchiveInput(text) {
  return /(?:\bBV[a-zA-Z0-9]{10}\b|\bav\d+\b|b23\.(?:tv|wtf)|bili2233\.cn|bilibili\.com)/i.test(
    text ?? '',
  );
}

// Mirror of resolveB23Links short-link pattern from lib/bili.js.
function shortLinkPattern(text) {
  return [
    ...String(text).matchAll(
      /(?:https?:\/\/)?(?:www\.)?b23\.(?:tv|wtf)\/[^\s<>'"`]+/gi,
    ),
  ];
}

function bili2233Pattern(text) {
  return [
    ...String(text).matchAll(
      /(?:https?:\/\/)?(?:www\.)?bili2233\.cn\/[^\s<>'"`]+/gi,
    ),
  ];
}

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

test('short link pattern matches b23.tv', () => {
  const matches = shortLinkPattern('check https://b23.tv/abc123 out');
  assert.equal(matches.length, 1);
});

test('short link pattern matches b23.wtf', () => {
  const matches = shortLinkPattern('check https://b23.wtf/xyz out');
  assert.equal(matches.length, 1);
});

test('bili2233.cn pattern matches', () => {
  const matches = bili2233Pattern('check https://bili2233.cn/abc123 out');
  assert.equal(matches.length, 1);
});

test('bili2233.cn pattern matches without scheme', () => {
  const matches = bili2233Pattern('check bili2233.cn/abc123 out');
  assert.equal(matches.length, 1);
});
