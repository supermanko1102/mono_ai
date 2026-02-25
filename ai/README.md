# Express + Genkit AI Agent

這是一個可直接啟動的 `Express + Genkit` AI Agent 範本。

## 功能

- `POST /api/agent/chat` 一般聊天 API（支援 session 記憶）
- `POST /api/agent/flow` Genkit Flow API（`expressHandler` 格式）
- Agent tools:
  - `getDateTime`：查指定時區時間
  - `calculate`：數學運算
  - `createFinanceItem`：新增資產/負債資料到 website SQLite
  - `lookupFaq`：查本地 FAQ

## 1) 設定環境變數

```bash
cp .env.example .env
```

在 `.env` 放入至少一個：

- `OPENAI_API_KEY=...`
- `GEMINI_API_KEY=...`
- 或 `GOOGLE_GENAI_API_KEY=...`

可選：

- `OPENAI_MODEL=gpt-4.1-mini`（預設即此值）
- `WEBSITE_DATA_BASE_URL=http://localhost:3000`（預設為此值）

Provider 選擇順序：

1. 若有 `OPENAI_API_KEY`，優先走 OpenAI
2. 否則走 Gemini (`GEMINI_API_KEY` 或 `GOOGLE_GENAI_API_KEY`)

## 2) 啟動

```bash
npm run dev
```

或

```bash
npm start
```

預設 port: `3010`

## 3) 測試 API

### Health

```bash
curl -sS http://localhost:3010/health
```

### Chat API

```bash
curl -sS -X POST http://localhost:3010/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "demo-1",
    "message": "帶我去 docs",
    "availableRoutes": ["/", "/pricing", "/docs", "/support"],
    "availableModals": ["pricing-comparison", "docs-quickstart", "support-contact"]
  }'
```

### 透過 Agent 新增資料（需 website backend 在 local 啟動）

```bash
curl -sS -X POST http://localhost:3010/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "demo-create-1",
    "message": "幫我新增一筆資產，category 是 ETF，amount 是 2500"
  }'
```

若 agent 判斷要執行前端動作，會回傳：

```json
{
  "answer": "我幫你打開文件頁面。",
  "actions": [
    { "type": "navigate", "to": "/docs" },
    { "type": "open_modal", "id": "docs-quickstart" }
  ],
  "navigateTo": "/docs",
  "openModalId": "docs-quickstart"
}
```

`navigateTo` / `openModalId` 為相容欄位，建議前端優先使用 `actions`。

### Flow API (`expressHandler` 需要 `data` 包裝)

```bash
curl -sS -X POST http://localhost:3010/api/agent/flow \
  -H 'Content-Type: application/json' \
  -d '{
    "data": {
      "message": "你可以做什麼？",
      "history": []
    }
  }'
```
