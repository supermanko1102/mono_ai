import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import './App.css';

type RouteItem = {
  path: string;
  title: string;
  subtitle: string;
  body: string;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user' | 'system';
  content: string;
};

type AgentChatResponse = {
  sessionId: string;
  answer: string;
  usedTools?: string[];
  navigateTo?: string;
  historyCount?: number;
  error?: string;
};

const SESSION_KEY = 'website-agent-session-id';

const ROUTES: RouteItem[] = [
  {
    path: '/',
    title: 'Home',
    subtitle: 'Welcome',
    body: '這裡是首頁。你可以在右側聊天欄輸入「帶我去 pricing」或「幫我打開 docs」。',
  },
  {
    path: '/pricing',
    title: 'Pricing',
    subtitle: 'Plan & Cost',
    body: 'Pricing 頁顯示方案價格。你也可以對 agent 說「帶我回首頁」。',
  },
  {
    path: '/docs',
    title: 'Docs',
    subtitle: 'Developer Guide',
    body: 'Docs 頁放文件與整合說明，適合測試 agent 導頁能力。',
  },
  {
    path: '/support',
    title: 'Support',
    subtitle: 'Contact',
    body: 'Support 頁是客服與常見問題入口。',
  },
];

const ROUTE_SET = new Set(ROUTES.map((route) => route.path));

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePath(path: string): string {
  const normalized =
    path !== '/' ? path.replace(/\/+$/, '') || '/' : path || '/';
  if (ROUTE_SET.has(normalized)) {
    return normalized;
  }
  return '/';
}

function getSessionId() {
  if (typeof window === 'undefined') {
    return 'website-session';
  }

  const existing = window.localStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }

  const created = `session-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  window.localStorage.setItem(SESSION_KEY, created);
  return created;
}

function PagePanel({ route }: { route: RouteItem }) {
  return (
    <section className="page-panel">
      <p className="page-subtitle">{route.subtitle}</p>
      <h2>{route.title}</h2>
      <p>{route.body}</p>
      <div className="page-hint">
        試試看在聊天輸入：「帶我去 /docs」或「帶我去 support 頁面」。
      </div>
    </section>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = normalizePath(location.pathname);
  const [sessionId] = useState(() => getSessionId());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: makeId(),
      role: 'assistant',
      content:
        '我是網站導覽助理。你可以說「帶我去 docs」或「打開 pricing」。',
    },
  ]);

  const routeOptions = useMemo(() => ROUTES.map((route) => route.path), []);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || loading) {
      return;
    }

    setLoading(true);
    setMessages((prev) => [
      ...prev,
      { id: makeId(), role: 'user', content: text },
    ]);
    setInput('');

    try {
      const response = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          message: text,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          locale: navigator.language || 'zh-TW',
          availableRoutes: routeOptions,
        }),
      });

      const data = (await response.json()) as AgentChatResponse;
      if (!response.ok) {
        throw new Error(data.error || 'Agent request failed');
      }

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          content: data.answer || '目前沒有可用回覆，請再試一次。',
        },
      ]);

      const nextPath = data.navigateTo ? normalizePath(data.navigateTo) : '';
      if (nextPath && ROUTE_SET.has(nextPath) && nextPath !== currentPath) {
        navigate(nextPath);
        setMessages((prev) => [
          ...prev,
          {
            id: makeId(),
            role: 'system',
            content: `已切換到 ${nextPath}`,
          },
        ]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'system',
          content: `連線失敗：${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">AI Site Navigator</p>
          <h1>Website Chat + Agent Navigation</h1>
        </div>
        <nav className="route-tabs" aria-label="Route tabs">
          {ROUTES.map((route) => (
            <NavLink
              key={route.path}
              to={route.path}
              end={route.path === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {route.title}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="layout">
        <Routes>
          {ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={<PagePanel route={route} />}
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <aside className="chat-panel">
          <div className="chat-header">
            <h3>Agent Chat</h3>
            <span>Session: {sessionId.slice(0, 10)}...</span>
          </div>

          <div className="chat-messages">
            {messages.map((message) => (
              <article key={message.id} className={`msg ${message.role}`}>
                <strong>
                  {message.role === 'assistant'
                    ? 'Agent'
                    : message.role === 'user'
                      ? 'You'
                      : 'System'}
                </strong>
                <p>{message.content}</p>
              </article>
            ))}
            {loading ? <p className="typing">Agent thinking...</p> : null}
          </div>

          <form className="chat-form" onSubmit={onSubmit}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="例如：帶我去 pricing，順便說明差異"
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()}>
              Send
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}

export default App;
