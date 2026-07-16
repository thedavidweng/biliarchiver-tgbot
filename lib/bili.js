import { fetch } from 'sdk';
import { MAX_SOURCE_JOB_ITEMS } from 'lib/constants';
import {
  archiveItemUrl,
  archiveIdentifier,
  isBvid,
  normaliseBvid,
} from 'lib/format';
import { getArchiveApiUrl } from 'lib/settings';

function archiveApiUrl(baseUrl, path) {
  return new URL(path, baseUrl).toString();
}

async function readJson(response) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

export async function enqueueArchives(bvids) {
  const baseUrl = await getArchiveApiUrl();
  if (!baseUrl) return { configured: false, results: [] };

  const results = [];
  for (const bvid of bvids) {
    try {
      const response = await fetch(
        archiveApiUrl(baseUrl, `archive/${encodeURIComponent(bvid)}`),
        { method: 'POST' },
      );
      const payload = await readJson(response);
      // API explicitly accepted or rejected (e.g. already queued). Both are
      // definitive responses — the item does not need retrying.
      results.push({ bvid, accepted: payload?.success === true, rejected: payload?.success !== true });
    } catch (error) {
      // Network or server error — the request may or may not have reached the
      // API. The item must be retried. The caller should roll back the offset
      // so this batch is re-sent; already-accepted items are idempotent (the
      // API returns success: false for duplicates).
      console.error('archive enqueue failed', { bvid, error: String(error) });
      results.push({ bvid, accepted: false, rejected: false, error: String(error) });
    }
  }

  return { configured: true, results };
}

export async function enqueueArchive(bvid) {
  const result = await enqueueArchives([bvid]);
  return {
    configured: result.configured,
    ...(result.results[0] ?? { bvid, accepted: false }),
  };
}

export async function pendingQueue() {
  const baseUrl = await getArchiveApiUrl();
  if (!baseUrl) return { configured: false, pending: [] };

  try {
    const response = await fetch(archiveApiUrl(baseUrl, 'archive'));
    const payload = await readJson(response);
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const pending = items
      .filter((item) => item?.status !== 'finished' && typeof item?.bvid === 'string')
      .map((item) => item.bvid);
    return { configured: true, pending };
  } catch (error) {
    console.error('queue lookup failed', String(error));
    return { configured: true, pending: null };
  }
}

export async function sourceBvids(sourceType, sourceId) {
  const baseUrl = await getArchiveApiUrl();
  if (!baseUrl) return { configured: false, bvids: [] };

  try {
    const response = await fetch(
      archiveApiUrl(
        baseUrl,
        `get_bvids_by/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}`,
      ),
      { method: 'POST' },
    );
    const payload = await readJson(response);
    if (payload?.success !== true || !Array.isArray(payload?.bvids)) {
      return { configured: true, bvids: [] };
    }

    const bvids = [...new Set(payload.bvids.map(normaliseBvid).filter(Boolean))];
    return {
      configured: true,
      bvids: bvids.slice(0, MAX_SOURCE_JOB_ITEMS),
      truncated: bvids.length > MAX_SOURCE_JOB_ITEMS,
    };
  } catch (error) {
    console.error('source lookup failed', String(error));
    return { configured: true, bvids: null };
  }
}

export async function archiveUrlIfAvailable(bvid) {
  if (!isBvid(bvid)) return null;

  try {
    const response = await fetch(
      `https://archive.org/metadata/${encodeURIComponent(archiveIdentifier(bvid))}`,
      { headers: { Accept: 'application/json' } },
    );
    const payload = await readJson(response);
    const hasVideo = Array.isArray(payload?.files)
      ? payload.files.some((file) => typeof file?.name === 'string' && /\.mp4$/i.test(file.name))
      : false;
    return hasVideo ? archiveItemUrl(bvid) : null;
  } catch (error) {
    console.warn('archive status lookup failed', String(error));
    return null;
  }
}

export async function resolveB23Links(text) {
  const matches = [
    ...String(text).matchAll(
      /(?:https?:\/\/)?(?:www\.)?(?:b23\.(?:tv|wtf)|bili2233\.cn)\/[^\s<>'"`]+/gi,
    ),
  ].slice(0, 3);
  let resolved = String(text);

  for (const match of matches) {
    const rawShortUrl = match[0].replace(/[),.!?]+$/, '');
    const shortUrl = /^https?:\/\//i.test(rawShortUrl)
      ? rawShortUrl
      : `https://${rawShortUrl}`;
    try {
      const response = await fetch(shortUrl, { redirect: 'follow' });
      if (response.ok && response.url) {
        resolved = resolved.replace(rawShortUrl, response.url);
      }
    } catch (error) {
      console.warn('short-link resolution failed', { shortUrl, error: String(error) });
    }
  }

  return resolved;
}

export async function bvidFromText(text) {
  const direct = /(?:^|[^a-zA-Z0-9])(BV[a-zA-Z0-9]{10})(?:$|[^a-zA-Z0-9])/i.exec(text);
  if (direct) return normaliseBvid(direct[1]);

  const av = /(?:^|[^a-zA-Z0-9])av(\d+)(?:$|[^a-zA-Z0-9])/i.exec(text);
  if (!av) return null;

  try {
    const response = await fetch(
      `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(av[1])}`,
      { headers: { Accept: 'application/json' } },
    );
    const payload = await readJson(response);
    return normaliseBvid(payload?.data?.bvid);
  } catch (error) {
    console.warn('av conversion failed', String(error));
    return null;
  }
}

function firstUrl(text) {
  const match = /(?:https?:\/\/)?(?:www\.)?(?:space\.)?bilibili\.com\/[^\s<>'"`]+/i.exec(text);
  if (!match) return null;
  const candidate = match[0].replace(/[),.!?]+$/, '');
  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

export function sourceFromText(text) {
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
