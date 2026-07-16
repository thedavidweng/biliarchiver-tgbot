export const SETTING_ARCHIVE_API_URL = 'archive_api_url';
export const SETTING_LOG_CHAT_ID = 'log_chat_id';
export const SETTING_LOG_THREAD_ID = 'log_thread_id';

export const SOURCE_JOB_BATCH_SIZE = 8;
export const MAX_SOURCE_JOB_ITEMS = 1000;

export const CALLBACK_STATUS_PREFIX = 'status:';
export const CALLBACK_SOURCE_PREFIX = 'source:';

// One-time first-admin claimant. Set this to the deployer's Telegram user ID
// before the first deploy, then send /start from that account. The claim is
// atomic (INSERT ... WHERE NOT EXISTS) and the value is ignored once any admin
// exists, so it is safe to leave it in source after the claim succeeds.
// Telegram authenticates the sender, so a public user ID is not a forgery risk.
export const INITIAL_ADMIN_USER_ID = null;
