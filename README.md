# BiliArchiver Bot for Telegram Serverless

A Telegram-only front end for a BiliArchiver API, built for [Telegram Serverless](https://core.telegram.org/bots/serverless).

The bot accepts Bilibili video links, BV and av IDs, short links, collections, favourites lists, series, and creator pages. It sends archive requests to a configured BiliArchiver API, keeps administration data in Telegram Serverless SQLite, and works without a VPS, webhook endpoint, Bot API token, or runtime npm packages.

> **This repository does not include the BiliArchiver API itself.** You must run a compatible BiliArchiver API somewhere reachable over public HTTPS and point the bot at it with `/setapi` after deploy. The API must expose the endpoints described in [API contract](#api-contract) below.

## Runtime design

| Concern | Implementation |
| --- | --- |
| Incoming updates | `handlers/message.js` and `handlers/callback_query.js` |
| Telegram calls | Platform `sdk/api` |
| Persistent state | Platform SQLite through `sdk/db` |
| BiliArchiver and archive lookups | Platform `sdk/fetch` |
| Bot configuration | `settings` table, managed by administrators |
| Long sources | Persisted source job with explicit, small callback batches |

The deployed code consists only of `schema.js`, `handlers/`, and `lib/`. Every import uses Telegram Serverless's bare module names (`sdk`, `schema`, `lib/...`).

## User commands

| Command or input | Result |
| --- | --- |
| Send a Bilibili video URL, BV ID, av ID, or `b23` link | Queue one video and show a status button |
| Send a collection, favourites list, series, or creator URL | Create a persisted source job and queue the first batch |
| `/bili` as a reply | Archive the link in the replied message |
| `/bilist` | Show up to ten currently pending archive requests |
| `/status BV…` | Show a status button for a known BVID |
| `/help` | Show the in-chat guide |
| `/id` | Show the sender's Telegram user ID |
| `/start` | Show the help guide; claims first admin if configured (see below) |

Source jobs retain the returned BVIDs in SQLite. Each click queues eight further requests, which keeps a Telegram Serverless invocation short and makes duplicate button presses safe. A source job stores at most 1,000 candidates.

## Administrator commands

The first administrator is claimed in-chat via `/start` (see [Deploy](#deploy)). Chat users cannot bootstrap administrator access any other way.

| Command | Result |
| --- | --- |
| `/admin` | Show the admin command list |
| `/addadmin USER_ID` | Grant administration |
| `/removeadmin USER_ID` | Revoke administration while retaining at least one admin |
| `/listadmins` | List administrators |
| `/blacklist USER_ID` | Block a user or chat ID |
| `/unblacklist USER_ID` | Remove a block |
| `/listblacklist` | List blocked IDs |
| `/message USER_ID TEXT` | Send an administrator message |
| `/setapi https://archive-api.example/` | Save the public BiliArchiver API base URL |
| `/setlog CHAT_ID [THREAD_ID]` | Send archive-request logs to a chat or forum topic |
| `/clearlog` | Disable archive-request logging |
| `/config` | Show the configured API origin and logging destination |

`/setapi` accepts an HTTPS URL without embedded credentials. The Serverless runtime has no application-secret store in this project, so the API endpoint is intentionally a public, unauthenticated HTTPS endpoint. The Telegram Serverless CLI token remains local in `.tgcloud/` or in `TGCLOUD_TOKEN` for CI.

## Prerequisites

- Node.js 18 or newer.
- A bot created with [@BotFather](https://t.me/BotFather) with **Serverless** enabled.
- A running BiliArchiver API reachable over public HTTPS. This bot only talks to it; it does not host it.
- Your own Telegram user ID, so you can claim the first admin role. Send `/id` to any bot (or to this one after deploy) to learn it.

## Deploy

### Quick checklist

Only one variable in source needs to be set before the first deploy:

1. **Set `INITIAL_ADMIN_USER_ID`** in `lib/constants.js` to your Telegram user ID.
2. `npm install` → `npx @tgcloud/cli init` → `npx @tgcloud/cli login`
3. `npm run deploy` (runs `check` + `push` + `migrate`) → `npm run webhook:sync`
4. Send `/start` to the bot from your Telegram account to claim admin.
5. Send `/setapi https://your-biliarchiver-api.example/` to point the bot at your API.

The full step-by-step follows.

### Step-by-step

1. Install dependencies. This pulls the pinned `@tgcloud/cli` declared in `package.json` and writes `package-lock.json`:

   ```sh
   npm install
   ```

   Do not run `npx tgcloud` directly on a clean machine: the unscoped `tgcloud` package on npm is an unrelated project. Always use `npm run <script>` or `npx @tgcloud/cli` so the pinned CLI from `package-lock.json` is used.

2. Initialize the local Telegram Serverless project and link it to the bot:

   ```sh
   npx @tgcloud/cli init
   npx @tgcloud/cli login
   ```

   `init` creates a `.tgcloud/` directory (gitignored) that ties this local project to your bot. `login` authenticates you against the Telegram Serverless platform.

3. Set your Telegram user ID as the one-time first-admin claimant in `lib/constants.js`:

   ```js
   export const INITIAL_ADMIN_USER_ID = 123456789;
   ```

   This is the **only** variable you must edit in source. To find your user ID, send `/id` to any bot (e.g. [@userinfobot](https://t.me/userinfobot)) or to this bot after deploy. The value is only consulted while no admin exists. Once you claim the role with `/start`, it is ignored and can be removed in a later commit. Telegram authenticates the sender, so a public user ID in source is not a forgery risk.

4. Validate, deploy code, apply the schema, and synchronize the webhook:

   ```sh
   npm run deploy          # runs check + push + migrate
   npm run webhook:sync    # register the platform webhook with Telegram
   ```

   Or run each step individually:

   ```sh
   npm run check           # parse + lint all deployable modules
   npm run push            # deploy code atomically
   npm run migrate         # apply the SQLite schema
   npm run webhook:sync    # synchronize the platform-managed webhook
   ```

   `npm run push` deploys code atomically. `npm run migrate` separately applies the SQLite schema; keep both commands in the release workflow. `webhook:sync` is needed once after the first deploy and again if you change the bot's webhook configuration.

5. From the Telegram account whose ID you set in step 3, send `/start` to the bot. It will atomically claim the first admin role and reply with next steps.

6. Still in Telegram, configure the archive API endpoint:

   ```text
   /setapi https://your-biliarchiver-api.example/
   ```

### Post-deploy configuration

After the first deploy and admin claim, all ongoing configuration is done in-chat — no redeploy needed:

| Setting | Command | Notes |
| --- | --- | --- |
| Archive API URL | `/setapi <url>` | Required. Public HTTPS, no embedded credentials. |
| Request logging | `/setlog <chat_id> [thread_id]` | Optional. Sends a log message per archive request. |
| Logging off | `/clearlog` | Disables request logging. |
| Show config | `/config` | Prints the current API URL and log destination. |
| Co-admins | `/addadmin <user_id>` | Grant admin to another user. |
| Block abuse | `/blacklist <user_id>` | Block a user or chat from the bot. |

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `/start` did not claim admin | You sent it from the wrong account. `INITIAL_ADMIN_USER_ID` must match the Telegram user ID of the sender. Send `/id` to confirm your ID, fix `lib/constants.js`, redeploy, then `/start` again. |
| Bot replies "archive API is not configured" | Run `/setapi <url>` as an admin. The API must be reachable over public HTTPS. |
| `npm run push` fails with auth error | Run `npx @tgcloud/cli login` again. The session in `.tgcloud/` may have expired. |
| Buttons do not respond | Run `npm run webhook:sync`. The webhook may not be registered with Telegram yet. |
| Schema errors after schema changes | Run `npm run migrate` to apply the latest schema. |
| `npx tgcloud` installs the wrong package | Use `npx @tgcloud/cli` (scoped) or `npm run <script>` instead. The unscoped `tgcloud` on npm is an unrelated project. |

## Local verification

`npm run check` parses every deployable module and rejects runtime dependencies that Telegram Serverless cannot load.

`npm test` runs the contract tests (no SDK or network required):

```sh
npm test
```

Use the platform runner for logic checks with the real SDK surface:

```sh
npx @tgcloud/cli run handlers/message '{ chat: { id: 1 }, from: { id: 1 }, message_id: 1, text: "/help" }'
npx @tgcloud/cli run handlers/message '{ chat: { id: 1 }, from: { id: 1 }, message_id: 2, text: "BV1xx411c7mD" }'
```

## Product boundaries

This repository serves Telegram conversations and callback buttons. A standalone status website and Telegram Mini App remain outside this deployment surface.

Archive completion is checked on demand from the status button. Telegram Serverless invokes a handler for each update, so persisted callbacks provide a reliable completion path without process-lifetime polling or delayed timers.

The platform's external `fetch` accepts textual responses up to 32 MB. The BiliArchiver API and Internet Archive metadata requests in this bot fit that contract.

## API contract

The bot talks to a BiliArchiver-compatible API over public HTTPS. The base URL is set with `/setapi`. All paths are relative to that base.

| Method | Path | Purpose | Expected response |
| --- | --- | --- | --- |
| `POST` | `archive/<bvid>` | Enqueue a single video for archiving | `{ "success": true }` on accepted, `{ "success": false }` on duplicate or rejected |
| `GET` | `archive` | List current archive items | `{ "items": [{ "bvid": "BV…", "status": "finished" \| "pending" \| … }] }` |
| `POST` | `get_bvids_by/<type>/<id>` | Resolve a source to its BVID list | `{ "success": true, "bvids": ["BV…", …] }` |

`<type>` is one of `season`, `favlist`, `series`, `up_videos`. `<id>` is the source identifier as parsed from the Bilibili URL.

The API must not require authentication credentials embedded in the URL. The bot stores only the base origin in SQLite.
