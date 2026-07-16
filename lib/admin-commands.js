import {
  addAdmin,
  addToBlacklist,
  hasAdmins,
  isAdmin,
  listAdmins,
  listBlacklisted,
  removeAdmin,
  removeFromBlacklist,
} from 'lib/admin';
import { escapeHtml, parseSafeInteger } from 'lib/format';
import {
  clearLogDestination,
  getArchiveApiUrl,
  getLogDestination,
  setArchiveApiUrl,
  setLogDestination,
} from 'lib/settings';
import { reply, sendToChat } from 'lib/telegram';

const ADMIN_COMMANDS = new Set([
  'admin',
  'addadmin',
  'removeadmin',
  'listadmins',
  'blacklist',
  'unblacklist',
  'listblacklist',
  'message',
  'setapi',
  'setlog',
  'clearlog',
  'config',
]);

const ADMIN_HELP = [
  '<b>Admin commands</b>',
  '<code>/addadmin USER_ID</code>',
  '<code>/removeadmin USER_ID</code>',
  '<code>/listadmins</code>',
  '<code>/blacklist USER_ID</code>',
  '<code>/unblacklist USER_ID</code>',
  '<code>/listblacklist</code>',
  '<code>/message USER_ID TEXT</code>',
  '<code>/setapi https://archive-api.example/</code>',
  '<code>/setlog CHAT_ID [THREAD_ID]</code>',
  '<code>/clearlog</code>',
  '<code>/config</code>',
].join('\n');

function targetAndRest(args) {
  const [target, ...rest] = args.trim().split(/\s+/);
  return { target: parseSafeInteger(target), rest: rest.join(' ') };
}

function mentionList(ids) {
  if (ids.length === 0) return 'None.';
  const shown = ids.slice(0, 50).map((id) => `<code>${id}</code>`).join(', ');
  return ids.length > 50 ? `${shown}\n… and ${ids.length - 50} more.` : shown;
}

async function requireAdmin(message) {
  const userId = message?.from?.id;
  if (Number.isSafeInteger(userId) && (await isAdmin(userId))) return userId;
  await reply(message, 'Admin access is required for that command.');
  return null;
}

export async function handleAdminCommand(message, command, args) {
  if (!ADMIN_COMMANDS.has(command)) return false;

  if (!(await hasAdmins())) {
    await reply(
      message,
      'No administrator is configured. The deployer must run `npx tgcloud run lib/bootstrap-admin \'<telegram-user-id>\'` from the linked project.',
    );
    return true;
  }

  if (command === 'admin') {
    const userId = await requireAdmin(message);
    if (userId !== null) await reply(message, ADMIN_HELP, { parse_mode: 'HTML' });
    return true;
  }

  const actorId = await requireAdmin(message);
  if (actorId === null) return true;

  if (command === 'addadmin') {
    const { target } = targetAndRest(args);
    if (target === null) {
      await reply(message, 'Usage: /addadmin USER_ID');
      return true;
    }
    const added = await addAdmin(target, actorId);
    await reply(message, added ? `Added <code>${target}</code> as an admin.` : `<code>${target}</code> is already an admin.`, {
      parse_mode: 'HTML',
    });
    return true;
  }

  if (command === 'removeadmin') {
    const { target } = targetAndRest(args);
    if (target === null) {
      await reply(message, 'Usage: /removeadmin USER_ID');
      return true;
    }
    const result = await removeAdmin(target);
    await reply(
      message,
      result.reason === 'last-admin'
        ? 'Keep at least one administrator configured.'
        : `Removed <code>${target}</code> from administrators.`,
      { parse_mode: 'HTML' },
    );
    return true;
  }

  if (command === 'listadmins') {
    await reply(message, `<b>Admins</b>\n${mentionList(await listAdmins())}`, { parse_mode: 'HTML' });
    return true;
  }

  if (command === 'blacklist' || command === 'unblacklist') {
    const { target } = targetAndRest(args);
    if (target === null) {
      await reply(message, `Usage: /${command} USER_ID`);
      return true;
    }

    if (command === 'blacklist') {
      if (await isAdmin(target)) {
        await reply(message, 'Remove administrator access before blocking that user.');
        return true;
      }
      const added = await addToBlacklist(target, actorId);
      await reply(message, added ? `Blocked <code>${target}</code>.` : `<code>${target}</code> is already blocked.`, {
        parse_mode: 'HTML',
      });
      try {
        await sendToChat(target, 'You have been blocked from using this bot. Contact an administrator if this is a mistake.');
      } catch {
        // The target may never have started the bot. The administrative change succeeded.
      }
    } else {
      await removeFromBlacklist(target);
      await reply(message, `Unblocked <code>${target}</code>.`, { parse_mode: 'HTML' });
    }
    return true;
  }

  if (command === 'listblacklist') {
    await reply(message, `<b>Blocked users</b>\n${mentionList(await listBlacklisted())}`, {
      parse_mode: 'HTML',
    });
    return true;
  }

  if (command === 'message') {
    const { target, rest } = targetAndRest(args);
    if (target === null || !rest) {
      await reply(message, 'Usage: /message USER_ID TEXT');
      return true;
    }
    try {
      await sendToChat(target, rest);
      await reply(message, `Message sent to <code>${target}</code>.`, { parse_mode: 'HTML' });
    } catch (error) {
      console.warn('admin message failed', String(error));
      await reply(message, 'Telegram could not deliver that message.');
    }
    return true;
  }

  if (command === 'setapi') {
    if (!args.trim()) {
      await reply(message, 'Usage: /setapi https://archive-api.example/');
      return true;
    }
    try {
      const configured = await setArchiveApiUrl(args.trim());
      await reply(message, `Archive API saved for <code>${escapeHtml(new URL(configured).origin)}</code>.`, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      await reply(message, `Invalid archive API URL: ${escapeHtml(error.message)}`, { parse_mode: 'HTML' });
    }
    return true;
  }

  if (command === 'setlog') {
    const [rawChatId, rawThreadId] = args.trim().split(/\s+/);
    const chatId = parseSafeInteger(rawChatId);
    const threadId = parseSafeInteger(rawThreadId);
    if (chatId === null || (rawThreadId && (threadId === null || threadId <= 0))) {
      await reply(message, 'Usage: /setlog CHAT_ID [THREAD_ID]');
      return true;
    }
    await setLogDestination(chatId, threadId);
    await reply(message, `Archive logging now goes to <code>${chatId}</code>.`, { parse_mode: 'HTML' });
    return true;
  }

  if (command === 'clearlog') {
    await clearLogDestination();
    await reply(message, 'Archive logging is disabled.');
    return true;
  }

  if (command === 'config') {
    const apiUrl = await getArchiveApiUrl();
    const log = await getLogDestination();
    const apiText = apiUrl ? `<code>${escapeHtml(new URL(apiUrl).origin)}</code>` : 'not configured';
    const logText = log
      ? `<code>${log.chatId}${log.threadId ? ` / topic ${log.threadId}` : ''}</code>`
      : 'disabled';
    await reply(message, `<b>Current configuration</b>\nArchive API: ${apiText}\nArchive logging: ${logText}`, {
      parse_mode: 'HTML',
    });
    return true;
  }

  return true;
}
