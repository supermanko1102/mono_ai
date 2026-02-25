import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

export type FinanceKind = "asset" | "liability";

export type FinanceItem = {
  id: number;
  kind: FinanceKind;
  category: string;
  amount: number;
  createdAt: string;
};

export type AllocationItem = {
  label: string;
  amount: number;
  tone: string;
  width: string;
};

export type DashboardData = {
  totals: {
    assets: number;
    liabilities: number;
    netWorth: number;
  };
  assets: AllocationItem[];
  liabilities: AllocationItem[];
};

type GroupedRow = {
  category: string;
  total: number;
};

const ASSET_TONES = ["blue", "light-blue", "pale-blue", "sky"] as const;
const LIABILITY_TONES = ["red", "pink", "orange", "yellow"] as const;

const DB_PATH =
  process.env.WEBSITE_DB_PATH?.trim() ||
  path.join(process.cwd(), "data", "website.db");

declare global {
  var __websiteDb: Database.Database | undefined;
}

function getDb() {
  if (!globalThis.__websiteDb) {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS finance_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('asset', 'liability')),
        category TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    seedIfEmpty(db);
    globalThis.__websiteDb = db;
  }

  return globalThis.__websiteDb;
}

function seedIfEmpty(db: Database.Database) {
  const countRow = db
    .prepare("SELECT COUNT(*) AS count FROM finance_items")
    .get() as { count: number };

  if (countRow.count > 0) {
    return;
  }

  const seedRows: Array<[FinanceKind, string, number]> = [
    ["asset", "MyFinances", 41359],
    ["asset", "MyProperties", 0],
    ["asset", "MyCollectables", 0],
    ["asset", "MyBelongings", 0],
    ["liability", "MyFinances", 1164],
    ["liability", "MyBelongings", 593],
    ["liability", "MyProperties", 516],
    ["liability", "MyCollectables", 54],
  ];

  const insertStmt = db.prepare(
    "INSERT INTO finance_items (kind, category, amount) VALUES (?, ?, ?)"
  );
  const tx = db.transaction((rows: Array<[FinanceKind, string, number]>) => {
    for (const [kind, category, amount] of rows) {
      insertStmt.run(kind, category, amount);
    }
  });
  tx(seedRows);
}

export function formatAud(amount: number, options?: { negativeStyle?: boolean }) {
  const abs = Math.abs(amount);
  const formatted = `AUD ${Math.round(abs).toLocaleString("en-AU")}`;

  if (options?.negativeStyle && amount > 0) {
    return `AUD (${Math.round(amount).toLocaleString("en-AU")})`;
  }
  if (options?.negativeStyle && amount < 0) {
    return `AUD (${Math.round(abs).toLocaleString("en-AU")})`;
  }
  return formatted;
}

function sumByKind(kind: FinanceKind): number {
  const row = getDb()
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM finance_items WHERE kind = ?"
    )
    .get(kind) as { total: number };
  return Number(row.total ?? 0);
}

function getGroupedByKind(kind: FinanceKind): GroupedRow[] {
  return getDb()
    .prepare(
      `SELECT category, COALESCE(SUM(amount), 0) AS total
       FROM finance_items
       WHERE kind = ?
       GROUP BY category
       ORDER BY total DESC, category ASC`
    )
    .all(kind) as GroupedRow[];
}

function toAllocationItems(
  rows: GroupedRow[],
  tones: readonly string[],
  total: number
): AllocationItem[] {
  return rows.map((row, index) => {
    const width = total > 0 ? Math.round((row.total / total) * 100) : 0;
    return {
      label: row.category,
      amount: row.total,
      tone: tones[index % tones.length] ?? "blue",
      width: `${width}%`,
    };
  });
}

export function getDashboardData(): DashboardData {
  const assetsTotal = sumByKind("asset");
  const liabilitiesTotal = sumByKind("liability");

  return {
    totals: {
      assets: assetsTotal,
      liabilities: liabilitiesTotal,
      netWorth: assetsTotal - liabilitiesTotal,
    },
    assets: toAllocationItems(
      getGroupedByKind("asset"),
      ASSET_TONES,
      assetsTotal
    ),
    liabilities: toAllocationItems(
      getGroupedByKind("liability"),
      LIABILITY_TONES,
      liabilitiesTotal
    ),
  };
}

export function listFinanceItems(limit = 100): FinanceItem[] {
  return getDb()
    .prepare(
      `SELECT id, kind, category, amount, created_at as createdAt
       FROM finance_items
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as FinanceItem[];
}

export function createFinanceItem(input: {
  kind: FinanceKind;
  category: string;
  amount: number;
}): FinanceItem {
  const category = input.category.trim();
  if (!category) {
    throw new Error("category is required");
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("amount must be a non-negative number");
  }

  const amount = Math.round(input.amount * 100) / 100;
  const result = getDb()
    .prepare(
      "INSERT INTO finance_items (kind, category, amount) VALUES (?, ?, ?)"
    )
    .run(input.kind, category, amount);

  const row = getDb()
    .prepare(
      `SELECT id, kind, category, amount, created_at as createdAt
       FROM finance_items
       WHERE id = ?`
    )
    .get(result.lastInsertRowid) as FinanceItem | undefined;

  if (!row) {
    throw new Error("failed to create finance item");
  }

  return row;
}
