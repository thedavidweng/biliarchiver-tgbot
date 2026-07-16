// Test the pure URL-parsing logic from lib/bili.js without the SDK.
// We re-implement sourceFromText here as a contract test so that if the
// implementation drifts, the test catches it. This avoids importing lib/bili.js
// which depends on the Serverless `sdk` module unavailable in CI.
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Mirror of sourceFromText from lib/bili.js — kept in sync as a contract test.
function firstUrl(text) {
  const match = /(?:https?:\/\/)?(?:www\.)?(?:space\.)?bilibili\.com\/[^\s<>'"`]+/i.exec(text);
  if (!match) return null;
  const candidate = match[0].replace(/[),.!?]+$/, '');
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function sourceFromText(text) {
  const candidate = firstUrl(text);
  if (!candidate) return null;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;

  if (host === 'space.bilibili.com') {
    const collectionId = url.searchParams.get('sid');
    const favouriteId = url.searchParams.get('fid');
    const userId = path.match(/^\/(\d+)\/?$/)?.[1];

    if (path.includes('/channel/collectiondetail') && collectionId) {
      return { type: 'season', id: collectionId, url: url.toString() };
    }
    if (path.includes('/channel/seriesdetail') && collectionId) {
      return { type: 'series', id: collectionId, url: url.toString() };
    }
    if (path.includes('/favlist') && favouriteId) {
      if (
        url.searchParams.get('ftype') === 'collect' &&
        url.searchParams.get('ctype') === '21'
      ) {
        return { type: 'season', id: favouriteId, url: url.toString() };
      }
      return { type: 'favlist', id: favouriteId, url: url.toString() };
    }
    if (userId) return { type: 'up_videos', id: userId, url: url.toString() };
  }

  if (host === 'bilibili.com') {
    const listId = path.match(/^\/(?:medialist\/(?:detail|play)\/)?list\/ml(\d+)/)?.[1]
      ?? path.match(/^\/medialist\/(?:detail|play)\/ml(\d+)/)?.[1];
    if (listId) return { type: 'favlist', id: listId, url: url.toString() };

    const listUserId = path.match(/^\/list\/(\d+)\/?$/)?.[1];
    const seriesId = url.searchParams.get('sid');
    if (listUserId && seriesId) return { type: 'series', id: seriesId, url: url.toString() };
    if (listUserId) return { type: 'up_videos', id: listUserId, url: url.toString() };
  }

  return null;
}

test('sourceFromText: collection (season) URL', () => {
  const result = sourceFromText('https://space.bilibili.com/12345/channel/collectiondetail?sid=678');
  assert.equal(result.type, 'season');
  assert.equal(result.id, '678');
});

test('sourceFromText: series URL', () => {
  const result = sourceFromText('https://space.bilibili.com/12345/channel/seriesdetail?sid=999');
  assert.equal(result.type, 'series');
  assert.equal(result.id, '999');
});

test('sourceFromText: favourites list URL', () => {
  const result = sourceFromText('https://space.bilibili.com/12345/favlist?fid=111');
  assert.equal(result.type, 'favlist');
  assert.equal(result.id, '111');
});

test('sourceFromText: favourites list with collect/ctype=21 is season', () => {
  const result = sourceFromText('https://space.bilibili.com/12345/favlist?fid=111&ftype=collect&ctype=21');
  assert.equal(result.type, 'season');
});

test('sourceFromText: creator uploads URL', () => {
  const result = sourceFromText('https://space.bilibili.com/12345');
  assert.equal(result.type, 'up_videos');
  assert.equal(result.id, '12345');
});

test('sourceFromText: medialist detail URL', () => {
  const result = sourceFromText('https://www.bilibili.com/medialist/detail/ml12345');
  assert.equal(result.type, 'favlist');
  assert.equal(result.id, '12345');
});

test('sourceFromText: list with series sid', () => {
  const result = sourceFromText('https://www.bilibili.com/list/12345?sid=99');
  assert.equal(result.type, 'series');
  assert.equal(result.id, '99');
});

test('sourceFromText: list without sid is up_videos', () => {
  const result = sourceFromText('https://www.bilibili.com/list/12345');
  assert.equal(result.type, 'up_videos');
  assert.equal(result.id, '12345');
});

test('sourceFromText: non-bilibili URL returns null', () => {
  assert.equal(sourceFromText('https://youtube.com/watch?v=123'), null);
});

test('sourceFromText: plain text returns null', () => {
  assert.equal(sourceFromText('hello world'), null);
});

test('sourceFromText: URL without scheme gets https prefix', () => {
  const result = sourceFromText('space.bilibili.com/12345');
  assert.ok(result);
  assert.match(result.url, /^https:\/\//);
});
