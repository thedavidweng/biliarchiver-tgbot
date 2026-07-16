import { db } from 'sdk';
import { asc, eq, inArray } from 'sdk/db';
import { admins, blacklist } from 'schema';

export async function hasAdmins() {
  return (await db.$count(admins)) > 0;
}

export async function isAdmin(userId) {
  if (!Number.isSafeInteger(userId)) return false;
  const row = await db
    .select({ userId: admins.userId })
    .from(admins)
    .where(eq(admins.userId, userId))
    .get();
  return Boolean(row);
}

export async function claimFirstAdmin(userId) {
  if (!Number.isSafeInteger(userId)) return false;

  await db.run(
    'INSERT INTO admins (user_id, granted_by_user_id) SELECT :id, :id WHERE NOT EXISTS (SELECT 1 FROM admins)',
    { ':id': userId },
  );

  return isAdmin(userId);
}

export async function addAdmin(userId, grantedByUserId) {
  const existed = await isAdmin(userId);
  await db
    .insert(admins)
    .values({ userId, grantedByUserId })
    .onConflictDoUpdate({
      target: admins.userId,
      set: { grantedByUserId },
    })
    .run();
  return !existed;
}

export async function removeAdmin(userId) {
  const adminList = await listAdmins();
  if (adminList.length <= 1 && adminList.includes(userId)) {
    return { removed: false, reason: 'last-admin' };
  }

  await db.delete(admins).where(eq(admins.userId, userId)).run();
  return { removed: true };
}

export async function listAdmins() {
  const rows = await db
    .select({ userId: admins.userId })
    .from(admins)
    .orderBy(asc(admins.userId))
    .all();
  return rows.map((row) => row.userId);
}

export async function addToBlacklist(userId, addedByUserId) {
  const existed = await isBlacklisted(userId);
  await db
    .insert(blacklist)
    .values({ userId, addedByUserId })
    .onConflictDoUpdate({
      target: blacklist.userId,
      set: { addedByUserId },
    })
    .run();
  return !existed;
}

export async function removeFromBlacklist(userId) {
  await db.delete(blacklist).where(eq(blacklist.userId, userId)).run();
}

export async function isBlacklisted(userId) {
  if (!Number.isSafeInteger(userId)) return false;
  const row = await db
    .select({ userId: blacklist.userId })
    .from(blacklist)
    .where(eq(blacklist.userId, userId))
    .get();
  return Boolean(row);
}

export async function isMessageBlocked(message) {
  const ids = [message?.from?.id, message?.chat?.id].filter(Number.isSafeInteger);
  if (ids.length === 0) return false;

  const blocked = await db
    .select({ userId: blacklist.userId })
    .from(blacklist)
    .where(inArray(blacklist.userId, ids))
    .get();
  return Boolean(blocked);
}

export async function listBlacklisted() {
  const rows = await db
    .select({ userId: blacklist.userId })
    .from(blacklist)
    .orderBy(asc(blacklist.userId))
    .all();
  return rows.map((row) => row.userId);
}
