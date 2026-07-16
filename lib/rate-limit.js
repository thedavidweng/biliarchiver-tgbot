import { db } from 'sdk';
import { eq, sql } from 'sdk/db';
import { rateLimitCounters } from 'schema';

// Atomically check and increment a per-user sliding-window counter. Returns
// { allowed, count, limit }. If the current window has expired the counter
// resets to 1 for the new window. Admins bypass the limit (pass limit=Infinity
// or check before calling).
//
// The whole check+increment is one UPSERT so two concurrent invocations cannot
// both slip under the limit.
export async function checkAndIncrementRateLimit(userId, limit, windowSeconds) {
  if (!Number.isSafeInteger(userId) || limit <= 0) {
    return { allowed: true, count: 0, limit };
  }

  const [row] = await db
    .insert(rateLimitCounters)
    .values({ userId, count: 1 })
    .onConflictDoUpdate({
      target: rateLimitCounters.userId,
      set: {
        count: sql`CASE
          WHEN unixepoch() - ${rateLimitCounters.windowStart} > ${windowSeconds}
            THEN 1
          ELSE ${rateLimitCounters.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN unixepoch() - ${rateLimitCounters.windowStart} > ${windowSeconds}
            THEN unixepoch()
          ELSE ${rateLimitCounters.windowStart}
        END`,
      },
    })
    .returning()
    .run();

  const count = row?.count ?? 0;
  return { allowed: count <= limit, count, limit };
}
