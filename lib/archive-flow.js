import {
  bvidFromText,
  enqueueArchive,
  resolveB23Links,
  sourceBvids,
  sourceFromText,
} from 'lib/bili';
import {
  confirmSourceBatch,
  countActiveSourceJobsByOwner,
  countActiveSourceJobsByRequester,
  createSourceJob,
  expireStaleSourceJobs,
  releaseSourceBatch,
  reserveSourceBatch,
} from 'lib/source-jobs';
import {
  directArchiveResultText,
  queueReservedSourceBatch,
  sourceIntro,
} from 'lib/interactions';
import { bvidLink, escapeHtml, messageText, sourceLabel } from 'lib/format';
import { isAdmin } from 'lib/admin';
import { checkAndIncrementRateLimit } from 'lib/rate-limit';
import {
  DIRECT_ARCHIVE_RATE_LIMIT,
  DIRECT_ARCHIVE_RATE_WINDOW_SECONDS,
  MAX_ACTIVE_SOURCE_JOBS_PER_CHAT,
  MAX_ACTIVE_SOURCE_JOBS_PER_USER,
  SOURCE_JOB_TTL_SECONDS,
} from 'lib/constants';
import { getLogDestination } from 'lib/settings';
import { reply, sendToChat, sourceKeyboard, statusKeyboard } from 'lib/telegram';

async function logRequest(message, bvid, source = null) {
  const destination = await getLogDestination();
  if (!destination) return;

  const actor = message?.from;
  const actorName = actor?.username
    ? `@${escapeHtml(actor.username)}`
    : escapeHtml(actor?.first_name ?? actor?.id ?? 'unknown user');
  const target = source
    ? `<a href="${escapeHtml(source.url)}">${escapeHtml(sourceLabel(source.type))}</a>`
    : `<a href="${bvidLink(bvid)}">${escapeHtml(bvid)}</a>`;

  try {
    await sendToChat(destination.chatId, `✅ Archive request for ${target} from ${actorName}`, {
      parse_mode: 'HTML',
      ...(destination.threadId ? { message_thread_id: destination.threadId } : {}),
    });
  } catch (error) {
    console.error('archive log failed', String(error));
  }
}

function sourceStatusText(job, results, source, intro) {
  const accepted = results.filter((result) => result.accepted).length;
  const rejected = results.length - accepted;
  const sent = Math.min(job.reservedEnd, job.totalCount);
  const remaining = Math.max(0, job.totalCount - sent);
  const lines = [
    intro,
    `<b>Queued ${sent} of ${job.totalCount}</b> ${escapeHtml(sourceLabel(source.type))} items.`,
    `This batch: ${accepted} accepted${rejected ? `, ${rejected} already queued or rejected` : ''}.`,
  ];

  lines.push(
    remaining > 0
      ? `Press the button to queue the next ${Math.min(job.batchSize, remaining)}.`
      : 'All source items have been sent to the archiver.',
  );
  return lines.join('\n');
}

async function handleSource(message, source) {
  const lookup = await sourceBvids(source.type, source.id);
  if (!lookup.configured) {
    await reply(message, 'The archive API is not configured yet. Ask an admin to run /setapi.', {
      parse_mode: 'HTML',
    });
    return;
  }
  if (lookup.bvids === null) {
    await reply(message, 'The source could not be read from the archiver right now.');
    return;
  }
  if (lookup.bvids.length === 0) {
    await reply(message, 'No archive candidates were returned for this source.');
    return;
  }
  if (!Number.isSafeInteger(message?.from?.id)) {
    await reply(message, 'Source jobs require a Telegram user identity.');
    return;
  }

  // Expire stale jobs before checking concurrency caps so abandoned jobs don't
  // permanently block new source creation.
  await expireStaleSourceJobs(SOURCE_JOB_TTL_SECONDS);

  const activeForChat = await countActiveSourceJobsByOwner(message.chat.id);
  if (activeForChat >= MAX_ACTIVE_SOURCE_JOBS_PER_CHAT) {
    await reply(
      message,
      `This chat already has ${activeForChat} active source job(s). Finish or let them expire before starting more.`,
    );
    return;
  }

  const activeForUser = await countActiveSourceJobsByRequester(message.from.id);
  if (activeForUser >= MAX_ACTIVE_SOURCE_JOBS_PER_USER) {
    await reply(
      message,
      `You already have ${activeForUser} active source job(s). Finish or let them expire before starting more.`,
    );
    return;
  }

  const job = await createSourceJob({
    ownerChatId: message.chat.id,
    requesterUserId: message.from.id,
    sourceType: source.type,
    sourceId: source.id,
    sourceUrl: source.url,
    bvids: lookup.bvids,
  });
  // First batch always starts at offset 0.
  const reserved = await reserveSourceBatch(job.id, 0);
  if (!reserved) {
    await reply(message, 'Could not start this source job. Please try again.');
    return;
  }

  const queued = await queueReservedSourceBatch(reserved);
  if (!queued.configured) {
    await releaseSourceBatch(job.id, 0);
    const retryJob = { ...reserved, nextOffset: 0 };
    await reply(message, '⚠️ The archive API is not configured yet. Ask an admin to run /setapi.', {
      parse_mode: 'HTML',
      reply_markup: sourceKeyboard(retryJob),
    });
    return;
  }

  // Network errors mean the request may not have reached the API. Roll back
  // the whole batch for retry; already-accepted items are idempotent.
  const hasErrors = queued.results.some((result) => result.error);
  if (hasErrors) {
    await releaseSourceBatch(job.id, 0);
    const retryJob = { ...reserved, nextOffset: 0 };
    const errorCount = queued.results.filter((result) => result.error).length;
    await reply(
      message,
      `⚠️ ${errorCount} item(s) failed due to a network or server error. Please try again — already-accepted items will be safely skipped.`,
      {
        parse_mode: 'HTML',
        reply_markup: sourceKeyboard(retryJob),
      },
    );
    return;
  }

  await confirmSourceBatch(job.id);
  const intro = sourceIntro(source, lookup.bvids.length, lookup.truncated);
  await reply(message, sourceStatusText(reserved, queued.results, source, intro), {
    parse_mode: 'HTML',
    reply_markup: sourceKeyboard(reserved),
  });
  await logRequest(message, null, source);
}

export async function handleArchiveInput(message, includeReply = false) {
  const original = messageText(message, includeReply);
  if (!original) return false;

  const text = await resolveB23Links(original);
  const bvid = await bvidFromText(text);
  if (bvid) {
    const userId = message?.from?.id;
    // Admins bypass the direct-archive rate limit.
    if (Number.isSafeInteger(userId) && !(await isAdmin(userId))) {
      const rate = await checkAndIncrementRateLimit(
        userId,
        DIRECT_ARCHIVE_RATE_LIMIT,
        DIRECT_ARCHIVE_RATE_WINDOW_SECONDS,
      );
      if (!rate.allowed) {
        await reply(
          message,
          `You have reached the rate limit of ${rate.limit} archive requests per hour. Please try again later.`,
        );
        return true;
      }
    }

    const result = await enqueueArchive(bvid);
    if (!result.configured) {
      await reply(message, 'The archive API is not configured yet. Ask an admin to run /setapi.');
      return true;
    }

    await reply(message, directArchiveResultText(bvid, result.accepted), {
      parse_mode: 'HTML',
      reply_markup: statusKeyboard(bvid),
    });
    await logRequest(message, bvid);
    return true;
  }

  const source = sourceFromText(text);
  if (source) {
    await handleSource(message, source);
    return true;
  }

  if (includeReply) {
    await reply(
      message,
      'Reply to a Bilibili video, playlist, collection, or creator link and use /bili.',
    );
  }
  return false;
}

export function looksLikeArchiveInput(text) {
  return /(?:\bBV[a-zA-Z0-9]{10}\b|\bav\d+\b|b23\.(?:tv|wtf)|bili2233\.cn|bilibili\.com)/i.test(
    text ?? '',
  );
}
