import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { settings } from 'schema';
import {
  SETTING_ARCHIVE_API_URL,
  SETTING_LOG_CHAT_ID,
  SETTING_LOG_THREAD_ID,
} from 'lib/constants';
import { parseSafeInteger } from 'lib/format';

export async function getSetting(key) {
  const row = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .get();
  return row?.value ?? null;
}

export async function setSetting(key, value) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(unixepoch())` },
    })
    .run();
}

export async function deleteSetting(key) {
  await db.delete(settings).where(eq(settings.key, key)).run();
}

export function normaliseArchiveApiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:') {
    throw new Error('The archive API must use https.');
  }
  if (url.username || url.password) {
    throw new Error('The archive API URL cannot contain credentials.');
  }

  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

export async function getArchiveApiUrl() {
  const value = await getSetting(SETTING_ARCHIVE_API_URL);
  if (!value) return null;

  try {
    return normaliseArchiveApiUrl(value);
  } catch {
    return null;
  }
}

export async function setArchiveApiUrl(value) {
  const normalised = normaliseArchiveApiUrl(value);
  await setSetting(SETTING_ARCHIVE_API_URL, normalised);
  return normalised;
}

export async function getLogDestination() {
  const chatId = parseSafeInteger(await getSetting(SETTING_LOG_CHAT_ID));
  if (chatId === null) return null;

  const threadId = parseSafeInteger(await getSetting(SETTING_LOG_THREAD_ID));
  return {
    chatId,
    ...(threadId !== null && threadId > 0 ? { threadId } : {}),
  };
}

export async function setLogDestination(chatId, threadId = null) {
  await setSetting(SETTING_LOG_CHAT_ID, String(chatId));
  if (threadId !== null && threadId > 0) {
    await setSetting(SETTING_LOG_THREAD_ID, String(threadId));
  } else {
    await deleteSetting(SETTING_LOG_THREAD_ID);
  }
}

export async function clearLogDestination() {
  await deleteSetting(SETTING_LOG_CHAT_ID);
  await deleteSetting(SETTING_LOG_THREAD_ID);
}
