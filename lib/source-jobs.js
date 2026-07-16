import { db } from 'sdk';
import { and, eq, sql } from 'sdk/db';
import { sourceJobs } from 'schema';
import { SOURCE_JOB_BATCH_SIZE } from 'lib/constants';

export async function createSourceJob({
  ownerChatId,
  requesterUserId,
  sourceType,
  sourceId,
  sourceUrl,
  bvids,
}) {
  const [job] = await db
    .insert(sourceJobs)
    .values({
      ownerChatId,
      requesterUserId,
      sourceType,
      sourceId,
      sourceUrl,
      bvids,
      totalCount: bvids.length,
      batchSize: SOURCE_JOB_BATCH_SIZE,
    })
    .returning()
    .run();
  return job;
}

export async function getSourceJob(id) {
  return db.select().from(sourceJobs).where(eq(sourceJobs.id, id)).get();
}

// Atomically claim the next batch. The callback data encodes the expectedOffset
// (the nextOffset value shown on the button), so WHERE next_offset = expectedOffset
// is an optimistic lock: each button can only reserve once. A second fast click
// of the same button sees next_offset already advanced and fails.
//
// nextOffset is advanced by batchSize (NOT clamped to totalCount), so for the
// final partial batch nextOffset may exceed totalCount. The caller uses
// reservedEnd = min(nextOffset, totalCount) to slice the actual bvids.
export async function reserveSourceBatch(id, expectedOffset) {
  const [job] = await db
    .update(sourceJobs)
    .set({
      nextOffset: sql`${sourceJobs.nextOffset} + ${sourceJobs.batchSize}`,
      lastActivityAt: sql`(unixepoch())`,
    })
    .where(
      and(
        eq(sourceJobs.id, id),
        eq(sourceJobs.status, 'active'),
        eq(sourceJobs.nextOffset, expectedOffset),
        sql`${sourceJobs.nextOffset} < ${sourceJobs.totalCount}`,
      ),
    )
    .returning()
    .run();

  if (!job) return null;

  const start = expectedOffset;
  const end = Math.min(job.nextOffset, job.totalCount);
  const bvids = Array.isArray(job.bvids) ? job.bvids.slice(start, end) : [];

  return {
    ...job,
    reservedStart: start,
    reservedEnd: end,
    bvids,
  };
}

// Roll the offset back so a failed batch is retried on the next click.
// The condition next_offset = expectedOffset + batch_size ensures we only
// roll back if THIS click's reserve is still the latest write; a later
// click that already advanced the offset makes the rollback a no-op.
export async function releaseSourceBatch(id, expectedOffset) {
  await db.run(
    'UPDATE source_jobs SET next_offset = :offset, last_activity_at = unixepoch() '
      + 'WHERE id = :id AND status = \'active\' '
      + 'AND next_offset = :offset + batch_size',
    { ':id': id, ':offset': expectedOffset },
  );
}

// Mark the job complete once the final batch has been successfully enqueued.
// Called only after a successful enqueue, so if nextOffset >= totalCount the
// last batch was the final one and all items have been sent.
export async function confirmSourceBatch(id) {
  await db.run(
    'UPDATE source_jobs SET status = \'complete\', last_activity_at = unixepoch() '
      + 'WHERE id = :id AND status = \'active\' AND next_offset >= total_count',
    { ':id': id },
  );
}

export async function countActiveSourceJobsByOwner(ownerChatId) {
  return db.$count(sourceJobs, and(eq(sourceJobs.ownerChatId, ownerChatId), eq(sourceJobs.status, 'active')));
}

export async function countActiveSourceJobsByRequester(userId) {
  return db.$count(sourceJobs, and(eq(sourceJobs.requesterUserId, userId), eq(sourceJobs.status, 'active')));
}

// Mark stale active jobs as expired. A job is stale if it has not had any
// activity (reserve/release/confirm) within the TTL window, measured from
// lastActivityAt (not createdAt). This frees the user to create new jobs
// without hitting the concurrency cap.
export async function expireStaleSourceJobs(ttlSeconds) {
  await db
    .update(sourceJobs)
    .set({ status: 'expired' })
    .where(
      and(
        eq(sourceJobs.status, 'active'),
        sql`unixepoch() - ${sourceJobs.lastActivityAt} > ${ttlSeconds}`,
      ),
    )
    .run();
}
