# website_v1 + AI Agent Chat

`website_v1` 已整合 agent chat，支援：

- `navigate` action：導頁到 `/, /pricing, /docs, /support`
- `open_modal` action：開啟指定 modal
- 透過 Next API route proxy 到 AI server（`/api/agent/chat`）

## 啟動方式

1. 先啟動 AI server：

```bash
cd ../ai
npm run dev
```

2. 再啟動 website_v1：

```bash
cd ../website_v1
npm run dev
```

## 可選環境變數

- `AI_AGENT_BASE_URL`：AI server base URL（預設 `http://localhost:3010`）

可放在 `website_v1/.env.local`：

```bash
AI_AGENT_BASE_URL=http://localhost:3010
```
