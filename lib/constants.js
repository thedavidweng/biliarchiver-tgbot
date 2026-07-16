export const SETTING_ARCHIVE_API_URL = 'archive_api_url';
export const SETTING_LOG_CHAT_ID = 'log_chat_id';
export const SETTING_LOG_THREAD_ID = 'log_thread_id';

export const SOURCE_JOB_BATCH_SIZE = 8;
export const MAX_SOURCE_JOB_ITEMS = 1000;

// Concurrency caps and TTL for source jobs. Stale "active" jobs that have not
// been advanced within the TTL window are expired so they don't permanently
// block new job creation or leave the user with a stuck "active" status.
export const MAX_ACTIVE_SOURCE_JOBS_PER_CHAT = 3;
export const MAX_ACTIVE_SOURCE_JOBS_PER_USER = 3;
export const SOURCE_JOB_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Per-user rate limit for direct archive requests. Each user may enqueue at
// most this many direct (non-source) archive requests within the window.
export const DIRECT_ARCHIVE_RATE_LIMIT = 20;
export const DIRECT_ARCHIVE_RATE_WINDOW_SECONDS = 60 * 60; // 1 hour

export const CALLBACK_STATUS_PREFIX = 'status:';
export const CALLBACK_SOURCE_PREFIX = 'source:';

// One-time first-admin claimant. Set this to the deployer's Telegram user ID
// before the first deploy, then send /start from that account. The claim is
// atomic (INSERT ... WHERE NOT EXISTS) and the value is ignored once any admin
// exists, so it is safe to leave it in source after the claim succeeds.
// Telegram authenticates the sender, so a public user ID is not a forgery risk.
export const INITIAL_ADMIN_USER_ID = null;
