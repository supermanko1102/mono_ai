import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const docsSections = [
  {
    title: "Quickstart",
    detail: "3 分鐘完成 API Key 設定、連線測試與第一個聊天請求。",
  },
  {
    title: "Action Protocol",
    detail: "支援 actions: navigate, open_modal；可擴充更多 UI actions。",
  },
  {
    title: "Governance",
    detail: "建議在前端保留 action 白名單與 fallback 行為。",
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
              Docs
            </p>
            <h1 className="text-3xl font-bold text-slate-800">Developer Guide</h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back Dashboard
          </Link>
        </header>

        <section className="space-y-3">
          {docsSections.map((item) => (
            <Card key={item.title} className="border-slate-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{item.detail}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
