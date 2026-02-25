# website + AI Agent Chat

`website` 已整合 agent chat，並新增本機 SQLite 資料層。

## 功能

- `navigate` action：導頁到 `/, /pricing, /docs, /support`
- `open_modal` action：開啟指定 modal
- 透過 Next API route proxy 到 AI server（`/api/agent/chat`）
- 本機資料 API（SQLite）：
  - `GET /api/data/summary`
  - `GET /api/data/items`
  - `POST /api/data/items`

SQLite 檔案預設在 `website/data/website.db`（會自動建表與 seed）。

## 啟動方式

1. 先啟動 AI server：

```bash
cd ../ai
npm run dev
```

2. 再啟動 website：

```bash
cd ../website
npm install
npm run dev
```

## 可選環境變數

- `AI_AGENT_BASE_URL`：AI server base URL（預設 `http://localhost:3010`）
- `WEBSITE_DB_PATH`：SQLite 路徑（預設 `./data/website.db`）

可放在 `website/.env.local`：

```bash
AI_AGENT_BASE_URL=http://localhost:3010
WEBSITE_DB_PATH=./data/website.db
```

## 快速驗證真資料

1. 查目前彙總：

```bash
curl -sS http://localhost:3000/api/data/summary
```

2. 新增一筆資產：

```bash
curl -sS -X POST http://localhost:3000/api/data/items \
  -H 'Content-Type: application/json' \
  -d '{"kind":"asset","category":"Crypto","amount":1200}'
```

3. 重新查彙總或刷新首頁，數字會變動：

```bash
curl -sS http://localhost:3000/api/data/summary
```
