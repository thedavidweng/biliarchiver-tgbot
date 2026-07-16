import {
  archiveUrlIfAvailable,
  enqueueArchives,
} from 'lib/bili';
import { isAdmin } from 'lib/admin';
import { archiveItemUrl, bvidLink, escapeHtml, isBvid } from 'lib/format';
import { reserveSourceBatch, getSourceJob } from 'lib/source-jobs';
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

export async function handleSourceCallback(callback, jobId) {
  const message = callback?.message;
  const callerId = callback?.from?.id;
  if (
    !Number.isSafeInteger(jobId) ||
    typeof message?.chat?.id !== 'number' ||
    !Number.isSafeInteger(callerId)
  ) {
    await answerCallback(callback, 'Invalid source job.', true);
    return;
  }

  const existing = await getSourceJob(jobId);
  if (!existing || existing.ownerChatId !== message.chat.id) {
    await answerCallback(callback, 'This source job is unavailable.', true);
    return;
  }

  if (callerId !== existing.requesterUserId && !(await isAdmin(callerId))) {
    await answerCallback(callback, 'Only the requester or an admin can continue this job.', true);
    return;
  }

  const job = await reserveSourceBatch(jobId);
  if (!job || job.bvids.length === 0) {
    await editCallbackMessage(callback, '✅ All source items have already been sent to the archiver.', {
      parse_mode: 'HTML',
    });
    await answerCallback(callback, 'Nothing left to queue.');
    return;
  }

  const queued = await queueReservedSourceBatch(job);
  if (!queued.configured) {
    await answerCallback(callback, 'The archive API has not been configured.', true);
    return;
  }

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
