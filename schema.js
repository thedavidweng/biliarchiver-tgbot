import { index, integer, json, sql, table, text } from 'sdk/db';

export const admins = table('admins', {
  userId: integer('user_id').primaryKey(),
  grantedByUserId: integer('granted_by_user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const blacklist = table('blacklist', {
  userId: integer('user_id').primaryKey(),
  addedByUserId: integer('added_by_user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const settings = table('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sourceJobs = table(
  'source_jobs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerChatId: integer('owner_chat_id').notNull(),
    requesterUserId: integer('requester_user_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceUrl: text('source_url').notNull(),
    bvids: json('bvids').notNull(),
    totalCount: integer('total_count').notNull(),
    nextOffset: integer('next_offset').notNull().default(0),
    batchSize: integer('batch_size').notNull().default(8),
    status: text('status').notNull().default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    ownerChatIdx: index('idx_source_jobs_owner_chat').on(t.ownerChatId),
    requesterIdx: index('idx_source_jobs_requester').on(t.requesterUserId),
  }),
);

// Per-user direct-archive request counter for rate limiting. Each row tracks
// how many direct (non-source) archive requests a user has made within the
// current window. The window start is stored as a unix timestamp; when the
// window expires the counter resets.
export const rateLimitCounters = table(
  'rate_limit_counters',
  {
    userId: integer('user_id').primaryKey(),
    count: integer('count').notNull().default(0),
    windowStart: integer('window_start', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
);
