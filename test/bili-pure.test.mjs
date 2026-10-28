import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceFromText } from '../lib/bili.js';

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
