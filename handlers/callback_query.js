import {
  CALLBACK_SOURCE_PREFIX,
  CALLBACK_STATUS_PREFIX,
} from 'lib/constants';
import {
  handleSourceCallback,
  handleStatusCallback,
} from 'lib/interactions';
import { answerCallback } from 'lib/telegram';

export default async function handleCallbackQuery(callback) {
  const data = callback?.data;
  if (typeof data !== 'string') {
    await answerCallback(callback, 'Unsupported action.', true);
    return;
  }

  try {
    if (data.startsWith(CALLBACK_STATUS_PREFIX)) {
      await handleStatusCallback(callback, data.slice(CALLBACK_STATUS_PREFIX.length));
      return;
    }

    if (data.startsWith(CALLBACK_SOURCE_PREFIX)) {
      const id = Number(data.slice(CALLBACK_SOURCE_PREFIX.length));
      await handleSourceCallback(callback, id);
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
