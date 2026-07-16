import {
  CALLBACK_SOURCE_PREFIX,
  CALLBACK_STATUS_PREFIX,
} from 'lib/constants';
import {
  handleSourceCallback,
  handleStatusCallback,
} from 'lib/interactions';
import { isAnyBlacklisted } from 'lib/admin';
import { answerCallback } from 'lib/telegram';

export default async function handleCallbackQuery(callback) {
  const data = callback?.data;
  if (typeof data !== 'string') {
    await answerCallback(callback, 'Unsupported action.', true);
    return;
  }

  try {
    const callerId = callback?.from?.id;
    const chatId = callback?.message?.chat?.id;
    if (Number.isSafeInteger(callerId) && (await isAnyBlacklisted([callerId, chatId]))) {
      await answerCallback(callback, 'You have been blocked from using this bot.', true);
      return;
    }

    if (data.startsWith(CALLBACK_STATUS_PREFIX)) {
      await handleStatusCallback(callback, data.slice(CALLBACK_STATUS_PREFIX.length));
      return;
    }

    if (data.startsWith(CALLBACK_SOURCE_PREFIX)) {
      const payload = data.slice(CALLBACK_SOURCE_PREFIX.length);
      const [idStr, offsetStr] = payload.split(':');
      const jobId = Number(idStr);
      const expectedOffset = Number(offsetStr);
      if (!Number.isSafeInteger(jobId) || !Number.isSafeInteger(expectedOffset) || expectedOffset < 0) {
        await answerCallback(callback, 'Invalid source job.', true);
        return;
      }
      await handleSourceCallback(callback, jobId, expectedOffset);
      return;
    }

    await answerCallback(callback, 'Unsupported action.', true);
  } catch (error) {
    console.error('callback handler failed', String(error));
    try {
      await answerCallback(callback, 'The action could not be completed. Please try again.', true);
    } catch (answerError) {
      console.error('callback error reply failed', String(answerError));
    }
  }
}
