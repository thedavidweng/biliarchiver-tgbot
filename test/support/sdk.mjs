import { DatabaseSync } from 'node:sqlite';
import { sourceJobs } from './schema.mjs';

export const sqlite = new DatabaseSync(':memory:');
sqlite.exec(`CREATE TABLE source_jobs (
  id INTEGER PRIMARY KEY, owner_chat_id INTEGER, requester_user_id INTEGER,
  source_type TEXT, source_id TEXT, source_url TEXT, bvids TEXT, total_count INTEGER,
  next_offset INTEGER, batch_size INTEGER, status TEXT, last_activity_at INTEGER
)`);
export let fetchHandler = () => { throw new Error('Unexpected fetch'); };
export function setFetch(handler) { fetchHandler = handler; }
export function fetch(...args) { return fetchHandler(...args); }
export const api = {
  editMessageText: async (payload) => { messages.push(payload); },
  answerCallbackQuery: async (payload) => { messages.push(payload); },
};
export const messages = [];
export let apiUrl = 'https://archive.example/';
export function setApiUrl(value) { apiUrl = value; }
const hydrate = (row) => row && Object.fromEntries(Object.entries(sourceJobs).map(([key, col]) => [key, key === 'bvids' ? JSON.parse(row[col.text]) : row[col.text]]));
export const db = {
  select() {
    return { from(table) { return { where(condition) { return { get() {
      if (table === sourceJobs) return hydrate(sqlite.prepare(`SELECT * FROM source_jobs WHERE ${condition.text}`).get(...condition.params));
      return apiUrl ? { value: apiUrl } : undefined;
    } }; } }; } };
  },
  update() {
    let values, condition;
    const query = {
      set(v) { values = v; return query; },
      where(v) { condition = v; return query; },
      returning() { return query; },
      run() {
        const entries = Object.entries(values);
        const assignments = entries.map(([key, value]) => `${sourceJobs[key].text} = ${value.text ?? '?'}`).join(', ');
        const params = entries.flatMap(([, value]) => value?.params ?? [value]);
        const statement = `UPDATE source_jobs SET ${assignments} WHERE ${condition.text}`;
        if ('nextOffset' in values) return sqlite.prepare(`${statement} RETURNING *`).all(...params, ...condition.params).map(hydrate);
        sqlite.prepare(statement).run(...params, ...condition.params);
      },
    };
    return query;
  },
  run(statement, params) { sqlite.prepare(statement).run(params); },
};
