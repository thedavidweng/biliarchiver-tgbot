export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function commandFromMessage(message) {
  const text = message?.text?.trim();
  if (!text?.startsWith('/')) return null;

  const [commandToken, ...argTokens] = text.split(/\s+/);
  const command = commandToken.slice(1).split('@')[0].toLowerCase();
  if (!command) return null;

  return { command, args: argTokens.join(' ') };
}

export function messageText(message, includeReply = false) {
  const parts = [message?.text ?? message?.caption ?? ''];
  if (includeReply) {
    const replied = message?.reply_to_message;
    const replyText = replied?.text ?? replied?.caption;
    if (replyText) parts.push(replyText);
  }
  return parts.filter(Boolean).join('\n');
}

export function parseSafeInteger(value) {
  if (!/^-?\d+$/.test(String(value).trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function isBvid(value) {
  return /^BV[a-zA-Z0-9]{10}$/.test(value ?? '');
}

export function normaliseBvid(value) {
  if (!/^bv[a-zA-Z0-9]{10}$/i.test(value ?? '')) return null;
  return `BV${value.slice(2)}`;
}

function humanReadableUpperPartMap(bvid) {
  let steps = 0;
  let result = '';

  for (const char of [...bvid].reverse()) {
    if (/[A-Z]/.test(char)) {
      result += steps === 0 ? char : `${steps}${char}`;
      steps = 0;
    } else {
      steps += 1;
    }
  }

  return result;
}

export function archiveIdentifier(bvid, part = 1) {
  return `BiliBili-${bvid}_p${part}-${humanReadableUpperPartMap(bvid)}`;
}

export function archiveItemUrl(bvid, part = 1) {
  return `https://archive.org/details/${archiveIdentifier(bvid, part)}`;
}

export function bvidLink(bvid) {
  return `https://www.bilibili.com/video/${bvid}`;
}

export function sourceLabel(sourceType) {
  return {
    season: 'collection',
    favlist: 'favourites list',
    series: 'series',
    up_videos: 'creator uploads',
  }[sourceType] ?? 'source';
}
