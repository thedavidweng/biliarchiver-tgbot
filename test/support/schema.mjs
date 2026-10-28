const column = (name) => ({ text: name, params: [] });
export const sourceJobs = Object.fromEntries(Object.entries({
  id: 'id', ownerChatId: 'owner_chat_id', requesterUserId: 'requester_user_id',
  sourceType: 'source_type', sourceId: 'source_id', sourceUrl: 'source_url',
  bvids: 'bvids', totalCount: 'total_count', nextOffset: 'next_offset',
  batchSize: 'batch_size', status: 'status', lastActivityAt: 'last_activity_at',
}).map(([key, name]) => [key, column(name)]));
export const settings = { key: column('key'), value: column('value') };
export const admins = { userId: column('user_id') };
export const blacklist = { userId: column('user_id') };
export const rateLimitCounters = { userId: column('user_id'), count: column('count'), windowStart: column('window_start') };
