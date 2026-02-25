# Express + Genkit AI Agent

這是一個可直接啟動的 `Express + Genkit` AI Agent 範本。

## 功能

- `POST /api/agent/chat` 一般聊天 API（支援 session 記憶）
- `POST /api/agent/flow` Genkit Flow API（`expressHandler` 格式）
- Agent tools:
  - `getDateTime`：查指定時區時間
  - `calculate`：數學運算
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

預設 port: `3000`

## 3) 測試 API

### Health

```bash
curl -sS http://localhost:3000/health
```

### Chat API

```bash
curl -sS -X POST http://localhost:3000/api/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "sessionId": "demo-1",
    "message": "帶我去 docs",
    "availableRoutes": ["/", "/pricing", "/docs", "/support"]
  }'
```

若 agent 判斷要導頁，會回傳：

```json
{
  "answer": "我幫你打開文件頁面。",
  "navigateTo": "/docs"
}
```

### Flow API (`expressHandler` 需要 `data` 包裝)

```bash
curl -sS -X POST http://localhost:3000/api/agent/flow \
  -H 'Content-Type: application/json' \
  -d '{
    "data": {
      "message": "你可以做什麼？",
      "history": []
    }
  }'
```
