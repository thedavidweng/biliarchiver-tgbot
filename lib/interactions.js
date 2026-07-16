import {
  archiveUrlIfAvailable,
  enqueueArchives,
} from 'lib/bili';
import { isAdmin } from 'lib/admin';
import { archiveItemUrl, bvidLink, escapeHtml, isBvid } from 'lib/format';
import {
  reserveSourceBatch,
  releaseSourceBatch,
  confirmSourceBatch,
  expireStaleSourceJobs,
  getSourceJob,
} from 'lib/source-jobs';
import { SOURCE_JOB_TTL_SECONDS } from 'lib/constants';
import {
  answerCallback,
  editCallbackMessage,
  sourceKeyboard,
  statusKeyboard,
} from 'lib/telegram';

function archiveBatchSummary(job, results) {
  const accepted = results.filter((result) => result.accepted).length;
  const rejected = results.length - accepted;
  const queued = Math.min(job.reservedEnd, job.totalCount);
  const remaining = Math.max(0, job.totalCount - queued);
  const details = [
    `<b>Queued ${queued} of ${job.totalCount}</b> from this source.`,
    `This batch: ${accepted} accepted${rejected ? `, ${rejected} already queued or rejected` : ''}.`,
  ];

  if (remaining > 0) {
    details.push(`Press the button to queue the next ${Math.min(job.batchSize, remaining)}.`);
  } else {
    details.push('All source items have been sent to the archiver.');
  }

  return details.join('\n');
}

export async function queueReservedSourceBatch(job) {
  const response = await enqueueArchives(job.bvids);
  if (!response.configured) return { configured: false, results: [] };
  return response;
}

export async function handleStatusCallback(callback, bvid) {
  if (!isBvid(bvid)) {
    await answerCallback(callback, 'Invalid archive status request.', true);
    return;
  }

  try {
    const archiveUrl = await archiveUrlIfAvailable(bvid);
    if (archiveUrl) {
      await editCallbackMessage(
        callback,
        `🎉 <b>${escapeHtml(bvid)}</b> is available on Internet Archive.`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: 'Open archive', url: archiveUrl }]],
          },
        },
      );
      await answerCallback(callback, 'Archive found.');
      return;
    }

    await editCallbackMessage(
      callback,
      `⏳ <b>${escapeHtml(bvid)}</b> is still processing or has no completed MP4 yet.`,
      { parse_mode: 'HTML', reply_markup: statusKeyboard(bvid) },
    );
    await answerCallback(callback, 'Still processing.');
  } catch (error) {
    console.error('status callback failed', String(error));
    await answerCallback(callback, 'Could not check the archive right now.', true);
  }
}

export async function handleSourceCallback(callback, jobId, expectedOffset) {
  const message = callback?.message;
  const callerId = callback?.from?.id;
  if (
    !Number.isSafeInteger(jobId) ||
    typeof message?.chat?.id !== 'number' ||
    !Number.isSafeInteger(callerId) ||
    !Number.isSafeInteger(expectedOffset) ||
    expectedOffset < 0
  ) {
    await answerCallback(callback, 'Invalid source job.', true);
    return;
  }

  // Expire stale jobs before checking so abandoned jobs don't block interaction.
  await expireStaleSourceJobs(SOURCE_JOB_TTL_SECONDS);

  const existing = await getSourceJob(jobId);
  if (!existing || existing.ownerChatId !== message.chat.id) {
    await answerCallback(callback, 'This source job is unavailable.', true);
    return;
  }

  if (existing.status !== 'active') {
    await editCallbackMessage(callback, '✅ All source items have already been sent to the archiver.', {
      parse_mode: 'HTML',
    });
    await answerCallback(callback, 'Nothing left to queue.');
    return;
  }

  if (callerId !== existing.requesterUserId && !(await isAdmin(callerId))) {
    await answerCallback(callback, 'Only the requester or an admin can continue this job.', true);
    return;
  }

  const job = await reserveSourceBatch(jobId, expectedOffset);
  if (!job || job.bvids.length === 0) {
    // Either the offset doesn't match (stale button / double click) or the
    // job is already complete. Re-read to distinguish.
    const current = await getSourceJob(jobId);
    if (current && current.status === 'active' && current.nextOffset !== expectedOffset) {
      await answerCallback(callback, 'This batch was already queued. Use the latest button.', true);
    } else {
      await editCallbackMessage(callback, '✅ All source items have already been sent to the archiver.', {
        parse_mode: 'HTML',
      });
      await answerCallback(callback, 'Nothing left to queue.');
    }
    return;
  }

  const queued = await queueReservedSourceBatch(job);
  if (!queued.configured) {
    await releaseSourceBatch(jobId, expectedOffset);
    const retryJob = { ...job, nextOffset: expectedOffset };
    await editCallbackMessage(callback, '⚠️ The archive API has not been configured. Please try again.', {
      parse_mode: 'HTML',
      reply_markup: sourceKeyboard(retryJob),
    });
    await answerCallback(callback, 'The archive API has not been configured.', true);
    return;
  }

  // Distinguish network errors from explicit API rejections. A network error
  // means the request may not have reached the API — the item must be retried.
  // Roll back the whole batch so it is re-sent; already-accepted items are
  // idempotent (the API returns success: false for duplicates on retry).
  const hasErrors = queued.results.some((result) => result.error);
  if (hasErrors) {
    await releaseSourceBatch(jobId, expectedOffset);
    const retryJob = { ...job, nextOffset: expectedOffset };
    const errorCount = queued.results.filter((result) => result.error).length;
    await editCallbackMessage(
      callback,
      `⚠️ ${errorCount} item(s) failed due to a network or server error. Please try again — already-accepted items will be safely skipped.`,
      {
        parse_mode: 'HTML',
        reply_markup: sourceKeyboard(retryJob),
      },
    );
    await answerCallback(callback, 'Some items failed. Please try again.', true);
    return;
  }

  // All items got a definitive API response (accepted or explicitly rejected).
  // Rejected items are typically already-queued duplicates and do not need
  // retrying.
  await confirmSourceBatch(jobId);
  await editCallbackMessage(callback, archiveBatchSummary(job, queued.results), {
    parse_mode: 'HTML',
    reply_markup: sourceKeyboard(job),
  });
  await answerCallback(callback, 'Next source batch queued.');
}

export function sourceIntro(source, count, truncated) {
  const suffix = truncated ? ' The source was capped at 1000 items.' : '';
  return (
    `Found <b>${count}</b> archive candidates in ` +
    `<a href="${escapeHtml(source.url)}">${escapeHtml(source.type)}</a>.${suffix}`
  );
}

export function directArchiveResultText(bvid, accepted) {
  const video = `<a href="${bvidLink(bvid)}">${escapeHtml(bvid)}</a>`;
  if (accepted) return `✅ Archive request for ${video} was accepted.`;
  return `⚠️ The archiver did not accept ${video}. It may already be queued or unavailable.`;
}

export function sourceJobLink(job) {
  return `<a href="${escapeHtml(job.sourceUrl)}">${escapeHtml(job.sourceType)}</a>`;
}

export function fallbackArchiveUrl(bvid) {
  return archiveItemUrl(bvid);
}
