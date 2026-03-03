import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const DB_PATH =
  process.env.WEBSITE_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "website.db");

declare global {
  // eslint-disable-next-line no-var
  var __websiteDb: Database.Database | undefined;
}

export function getDb() {
  if (!globalThis.__websiteDb) {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    globalThis.__websiteDb = db;
  }
  return globalThis.__websiteDb;
}
