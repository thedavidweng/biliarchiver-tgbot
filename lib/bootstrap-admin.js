import { claimFirstAdmin, hasAdmins } from 'lib/admin';
import { parseSafeInteger } from 'lib/format';

// Run explicitly through `npx tgcloud run lib/bootstrap-admin '<telegram-user-id>'`.
// This module is deployable but receives no Telegram update type, so it cannot be
// reached by a chat user.
export default async function bootstrapAdmin(userId) {
  const id = parseSafeInteger(userId);
  if (id === null || id <= 0) {
    throw new Error('Provide one positive Telegram user ID.');
  }
  if (await hasAdmins()) {
    throw new Error('An administrator already exists. Use /addadmin from an admin account.');
  }

  if (!(await claimFirstAdmin(id))) {
    throw new Error('The initial administrator could not be claimed.');
  }

  return { adminUserId: id };
}
