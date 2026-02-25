# Website Chat Navigation Demo

這個前端提供：

- 站內路由（`/`, `/pricing`, `/docs`, `/support`）
- 右側 chat 面板
- 呼叫 `POST /api/agent/chat`
- 若 agent 回傳 `navigateTo`，前端自動切換路由

## 啟動

先啟動 AI server（預設 `http://localhost:3000`）：

```bash
cd ../ai
npm run dev
```

再啟動網站：

```bash
cd ../website
npm run dev
```

`vite.config.ts` 已設定 `/api/agent` proxy 到 `http://localhost:3000`。
