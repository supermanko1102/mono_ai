# mono-ai 啟動指南

這份文件說明如何在本機啟動：

- `agent`（`ai/`，Express + Genkit）
- `website`（`website/`，Next.js）

## 1. 前置需求

- Node.js 18+（建議用 LTS）
- pnpm

## 2. 首次安裝

在專案根目錄執行：

```bash
cd /Users/alex/Desktop/mono-ai/ai
pnpm install

cd /Users/alex/Desktop/mono-ai/website
pnpm install
```

## 3. 啟動 Agent（ai）

```bash
cd /Users/alex/Desktop/mono-ai/ai
cp .env.example .env
```

編輯 `ai/.env`，至少設定一組金鑰：

- `OPENAI_API_KEY=...`
- 或 `GEMINI_API_KEY=...`
- 或 `GOOGLE_GENAI_API_KEY=...`

啟動：

```bash
pnpm dev
```

預設會跑在 `http://localhost:3010`。

健康檢查：

```bash
curl -sS http://localhost:3010/health
```

## 4. 啟動 Website

開另一個終端機：

```bash
cd /Users/alex/Desktop/mono-ai/website
pnpm dev
```

預設會跑在 `http://localhost:3000`。

如果要手動設定 agent 連線位置，可在 `website/.env.local` 放：

```bash
AI_AGENT_BASE_URL=http://localhost:3010
```

## 5. DB 初始化（給其他人）

`website` 的 SQLite 會在第一次存取資料 API 時自動初始化，不需要手動跑 migration。

初始化流程：

1. clone 專案
2. `cd /Users/alex/Desktop/mono-ai/website && pnpm install`
3. 啟動 website：`pnpm dev`
4. 打一次 `http://localhost:3000/api/data/summary`

完成後會自動產生：

- `website/data/website.db`
- `finance_items` 資料表
- 預設 seed 資料（只在空資料庫時插入）

如果要重置本機 DB，可以刪掉 `website/data/website.db` 後重啟 `pnpm dev`，系統會重新建庫與 seed。

## 6. 建議啟動順序

1. 先開 `agent`（`ai`）
2. 再開 `website`
3. 打開 `http://localhost:3000` 測試聊天與資料功能

## 7. 常用指令

Agent:

```bash
cd /Users/alex/Desktop/mono-ai/ai
pnpm dev      # 開發模式
pnpm build    # 編譯
pnpm start    # 先 build 再啟動 production server
```

Website:

```bash
cd /Users/alex/Desktop/mono-ai/website
pnpm dev      # 開發模式
pnpm build    # 編譯
pnpm start    # 啟動 production server
```
