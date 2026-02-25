import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const plans = [
  { name: "Free", price: "AUD 0", note: "個人試用，基本追蹤與 1 個專案" },
  { name: "Pro", price: "AUD 39", note: "進階分析、更多資料來源與自動報表" },
  { name: "Enterprise", price: "Contact", note: "SLA、治理、客製整合與專屬支援" },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
              Pricing
            </p>
            <h1 className="text-3xl font-bold text-slate-800">Plan & Cost</h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back Dashboard
          </Link>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.name} className="border-slate-200 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-1 text-2xl font-semibold text-slate-800">{plan.price}</p>
                <p className="text-sm text-slate-600">{plan.note}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
