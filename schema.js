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
  },
  (t) => ({
    ownerChatIdx: index('idx_source_jobs_owner_chat').on(t.ownerChatId),
    requesterIdx: index('idx_source_jobs_requester').on(t.requesterUserId),
  }),
);
