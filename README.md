# BiliArchiver Bot for Telegram Serverless

A Telegram-only front end for a BiliArchiver API, built for [Telegram Serverless](https://core.telegram.org/bots/serverless).

The bot accepts Bilibili video links, BV and av IDs, short links, collections, favourites lists, series, and creator pages. It sends archive requests to a configured BiliArchiver API, keeps administration data in Telegram Serverless SQLite, and works without a VPS, webhook endpoint, Bot API token, or runtime npm packages.

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

Source jobs retain the returned BVIDs in SQLite. Each click queues eight further requests, which keeps a Telegram Serverless invocation short and makes duplicate button presses safe. A source job stores at most 1,000 candidates.

## Administrator commands

The deployer initializes the first administrator through the linked Telegram Serverless CLI. Chat users cannot bootstrap administrator access.

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

## Deploy

1. Create a bot with [@BotFather](https://t.me/BotFather) and enable **Serverless** for it.
2. Install the official CLI declared in `package.json`.
3. Initialize the local Telegram Serverless project and link it to the bot:

   ```sh
   npx tgcloud init
   npx tgcloud login
   ```

4. Validate, deploy modules, apply the reviewed schema, and synchronize the platform-managed webhook:

   ```sh
   npm run check
   npx tgcloud push
   npx tgcloud migrate
   npx tgcloud webhook sync
   ```

5. Send `/id` to the deployed bot from the owner account, then initialize that ID locally and configure the endpoint in Telegram:

   ```sh
   npx tgcloud run lib/bootstrap-admin '123456789'
   ```

   ```text
   /setapi https://archive-api.example/
   ```

`npx tgcloud push` deploys code atomically. `npx tgcloud migrate` separately applies the SQLite schema; keep both commands in the release workflow.

## Local verification

`npm run check` parses every deployable module and rejects runtime dependencies that Telegram Serverless cannot load.

Use the platform runner for logic checks with the real SDK surface:

```sh
npx tgcloud run handlers/message '{ chat: { id: 1 }, from: { id: 1 }, message_id: 1, text: "/help" }'
npx tgcloud run handlers/message '{ chat: { id: 1 }, from: { id: 1 }, message_id: 2, text: "BV1xx411c7mD" }'
```

## Product boundaries

This repository serves Telegram conversations and callback buttons. A standalone status website and Telegram Mini App remain outside this deployment surface.

Archive completion is checked on demand from the status button. Telegram Serverless invokes a handler for each update, so persisted callbacks provide a reliable completion path without process-lifetime polling or delayed timers.

The platform's external `fetch` accepts textual responses up to 32 MB. The BiliArchiver API and Internet Archive metadata requests in this bot fit that contract.
