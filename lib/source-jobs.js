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

// Reserving the next range in one UPDATE prevents two fast callback presses from
// processing the same BVIDs. nextOffset may move past totalCount for the final batch.
export async function reserveSourceBatch(id) {
  const [job] = await db
    .update(sourceJobs)
    .set({ nextOffset: sql`${sourceJobs.nextOffset} + ${sourceJobs.batchSize}` })
    .where(
      and(
        eq(sourceJobs.id, id),
        eq(sourceJobs.status, 'active'),
        sql`${sourceJobs.nextOffset} < ${sourceJobs.totalCount}`,
      ),
    )
    .returning()
    .run();

  if (!job) return null;

  const start = Math.max(0, job.nextOffset - job.batchSize);
  const end = Math.min(job.nextOffset, job.totalCount);
  const bvids = Array.isArray(job.bvids) ? job.bvids.slice(start, end) : [];
  const complete = end >= job.totalCount;

  if (complete) {
    await db
      .update(sourceJobs)
      .set({ status: 'complete' })
      .where(eq(sourceJobs.id, job.id))
      .run();
  }

  return {
    ...job,
    status: complete ? 'complete' : job.status,
    reservedStart: start,
    reservedEnd: end,
    bvids,
  };
}
