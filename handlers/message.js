import { handleAdminCommand } from 'lib/admin-commands';
import { handleArchiveInput, looksLikeArchiveInput } from 'lib/archive-flow';
import { isMessageBlocked } from 'lib/admin';
import { commandFromMessage, normaliseBvid } from 'lib/format';
import { pendingQueue } from 'lib/bili';
import { reply, statusKeyboard } from 'lib/telegram';

const HELP = [
  '<b>BiliArchiver Bot</b>',
  'Send a Bilibili video link, BV/av ID, collection, favourites list, series, or creator page.',
  '',
  '<code>/bili</code> — archive a link in this message or the replied message',
  '<code>/bilist</code> — show pending archive requests',
  '<code>/status BV…</code> — check a completed Internet Archive item',
  '<code>/help</code> — show this help',
  '',
  'Collections and lists run in small persisted batches. Use the button in the reply to queue the next batch.',
].join('\n');

async function blockedReply(message) {
  await reply(
    message,
    'You have been blocked from using this bot. Contact an administrator if this is a mistake.',
  );
}

async function showQueue(message) {
  const queue = await pendingQueue();
  if (!queue.configured) {
    await reply(message, 'The archive API is not configured yet. Ask an admin to run /setapi.');
    return;
  }
  if (queue.pending === null) {
    await reply(message, 'The pending archive queue could not be read right now.');
    return;
  }
  if (queue.pending.length === 0) {
    await reply(message, 'All known archive requests are complete.');
    return;
  }

  const visible = queue.pending.slice(0, 10).map((bvid) => `<code>${bvid}</code>`);
  const remainder = queue.pending.length - visible.length;
  await reply(
    message,
    `<b>${queue.pending.length} archive request(s) pending</b>\n${visible.join('\n')}${
      remainder > 0 ? `\n… and ${remainder} more.` : ''
    }`,
    { parse_mode: 'HTML' },
  );
}

async function showStatus(message, args) {
  const bvid = normaliseBvid(args.trim());
  if (!bvid) {
    await reply(message, 'Usage: /status BVxxxxxxxxxx');
    return;
  }
  await reply(message, `Use the button to check <code>${bvid}</code>.`, {
    parse_mode: 'HTML',
    reply_markup: statusKeyboard(bvid),
  });
}

export default async function handleMessage(message) {
  if (typeof message?.chat?.id !== 'number') return;

  try {
    if (await isMessageBlocked(message)) {
      await blockedReply(message);
      return;
    }

    const parsed = commandFromMessage(message);
    if (parsed && (await handleAdminCommand(message, parsed.command, parsed.args))) return;

    if (parsed?.command === 'start' || parsed?.command === 'help') {
      await reply(message, HELP, { parse_mode: 'HTML' });
      return;
    }

    if (parsed?.command === 'id') {
      if (Number.isSafeInteger(message?.from?.id)) {
        await reply(message, `Your Telegram user ID is <code>${message.from.id}</code>.`, {
          parse_mode: 'HTML',
        });
      }
      return;
    }

    if (parsed?.command === 'bili') {
      await handleArchiveInput(message, true);
      return;
    }

    if (parsed?.command === 'bilist') {
      await showQueue(message);
      return;
    }

    if (parsed?.command === 'status') {
      await showStatus(message, parsed.args);
      return;
    }

    const text = message.text ?? message.caption;
    if (looksLikeArchiveInput(text)) {
      await handleArchiveInput(message);
    }
  } catch (error) {
    console.error('message handler failed', String(error));
    try {
      await reply(message, 'The request could not be completed right now. Please try again.');
    } catch (replyError) {
      console.error('error reply failed', String(replyError));
    }
  }
}
