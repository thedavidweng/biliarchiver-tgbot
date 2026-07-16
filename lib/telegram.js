import { api } from 'sdk';
import {
  CALLBACK_SOURCE_PREFIX,
  CALLBACK_STATUS_PREFIX,
} from 'lib/constants';

function threadParameters(message) {
  return typeof message?.message_thread_id === 'number'
    ? { message_thread_id: message.message_thread_id }
    : {};
}

export async function reply(message, text, options = {}) {
  if (typeof message?.chat?.id !== 'number') return null;

  return api.sendMessage({
    chat_id: message.chat.id,
    text,
    reply_parameters:
      typeof message.message_id === 'number'
        ? { message_id: message.message_id }
        : undefined,
    ...threadParameters(message),
    ...options,
  });
}

export async function sendToChat(chatId, text, options = {}) {
  return api.sendMessage({ chat_id: chatId, text, ...options });
}

export async function editCallbackMessage(callback, text, options = {}) {
  const message = callback?.message;
  if (
    typeof message?.chat?.id !== 'number' ||
    typeof message?.message_id !== 'number'
  ) {
    return null;
  }

  return api.editMessageText({
    chat_id: message.chat.id,
    message_id: message.message_id,
    text,
    ...options,
  });
}

export async function answerCallback(callback, text, showAlert = false) {
  return api.answerCallbackQuery({
    callback_query_id: callback.id,
    text,
    show_alert: showAlert,
  });
}

export function statusKeyboard(bvid) {
  return {
    inline_keyboard: [
      [{ text: 'Check archive status', callback_data: `${CALLBACK_STATUS_PREFIX}${bvid}` }],
    ],
  };
}

export function sourceKeyboard(job) {
  if (job.nextOffset >= job.totalCount) return undefined;
  const remaining = Math.max(0, job.totalCount - job.nextOffset);
  const nextCount = Math.min(job.batchSize, remaining);

  return {
    inline_keyboard: [
      [
        {
          text: `Queue next ${nextCount} (${remaining} remaining)`,
          callback_data: `${CALLBACK_SOURCE_PREFIX}${job.id}`,
        },
      ],
    ],
  };
}
