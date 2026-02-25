import {
  Bell,
  ChartNoAxesColumn,
  CircleDollarSign,
  Gem,
  Globe,
  House,
  Link2,
  Plus,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";

import {
  formatAud,
  getDashboardData,
  type AllocationItem,
} from "@/lib/server/finance-store";
import { AddFinanceItemModal } from "@/components/add-finance-item-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const sideMenu = [
  { label: "Create", icon: Plus },
  { label: "Globe", icon: Globe },
  { label: "Chart", icon: ChartNoAxesColumn },
  { label: "Home", icon: House },
  { label: "Gem", icon: Gem },
  { label: "Wallet", icon: Wallet },
  { label: "Link", icon: Link2 },
  { label: "Close", icon: X },
] as const;

export const dynamic = "force-dynamic";

export default function Home() {
  const dashboard = getDashboardData();
  const assetTotal = Math.round(dashboard.totals.assets).toLocaleString("en-AU");
  const liabilityTotal = `(${Math.round(dashboard.totals.liabilities).toLocaleString(
    "en-AU"
  )})`;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="grid min-h-screen grid-cols-[64px_1fr] max-[980px]:grid-cols-1">
        <aside className="flex flex-col items-center gap-3 border-r border-slate-200 bg-white p-2 max-[980px]:flex-row max-[980px]:overflow-x-auto max-[980px]:border-r-0 max-[980px]:border-b">
          <div className="mb-1 grid size-9 place-items-center rounded-lg border border-slate-200 text-sm font-bold text-cyan-600 max-[980px]:mb-0">
            M
          </div>
          {sideMenu.map((item, index) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.label}
                variant={index === 0 ? "default" : "outline"}
                size="icon"
                className={
                  index === 0
                    ? "size-8 rounded-lg bg-cyan-600 hover:bg-cyan-700"
                    : "size-8 rounded-lg border-slate-200 text-slate-500 hover:bg-slate-100"
                }
                aria-label={item.label}
              >
                <Icon className="size-4" />
              </Button>
            );
          })}
        </aside>

        <main className="p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-600">
              MYASSETS
            </h1>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search MyAssets"
                className="h-9 w-56 border-slate-300 bg-white text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 border-slate-300"
                aria-label="Notifications"
              >
                <Bell className="size-4 text-slate-700" />
              </Button>
              <AddFinanceItemModal />
            </div>
          </header>

          <section className="mb-3 flex flex-wrap items-center gap-2">
            <Link
              href="/pricing"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Pricing
            </Link>
            <Link
              href="/docs"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Docs
            </Link>
            <Link
              href="/support"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Support
            </Link>
            <p className="ml-1 text-xs text-slate-500">
              Agent can also navigate and open modals via chat.
            </p>
          </section>

          <section className="mb-3 grid overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:grid-cols-[1.7fr_repeat(3,minmax(140px,1fr))]">
            <div className="flex items-center border-r border-slate-200 px-4 py-3 text-sm font-semibold max-lg:col-span-2 max-lg:border-r-0 max-lg:border-b">
              <Globe className="mr-2 size-4 text-slate-500" />
              Global Dashboard
            </div>
            <SummaryCell
              label="My Net Worth"
              value={formatAud(dashboard.totals.netWorth)}
            />
            <SummaryCell
              label="My Assets"
              value={formatAud(dashboard.totals.assets)}
            />
            <SummaryCell
              label="My Liabilities"
              value={formatAud(dashboard.totals.liabilities, {
                negativeStyle: true,
              })}
              isDanger
            />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <AllocationCard
              title="Assets Allocation"
              total={assetTotal}
              donutClassName="donut-asset"
              items={dashboard.assets}
            />
            <AllocationCard
              title="Liabilities Allocation"
              total={liabilityTotal}
              donutClassName="donut-liability"
              items={dashboard.liabilities}
              negativeValues
            />
          </section>

          <section className="mt-3 grid gap-3 md:grid-cols-3">
            <MiniCard
              label="Net Value"
              value={formatAud(dashboard.totals.netWorth)}
            />
            <MiniCard
              label="Assets"
              value={formatAud(dashboard.totals.assets)}
            />
            <MiniCard
              label="Liabilities"
              value={formatAud(dashboard.totals.liabilities, {
                negativeStyle: true,
              })}
              isDanger
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  isDanger = false,
}: {
  label: string;
  value: string;
  isDanger?: boolean;
}) {
  return (
    <div className="border-r border-slate-200 px-4 py-3 last:border-r-0 max-lg:border-r-0 lg:last:border-r-0">
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-semibold ${isDanger ? "text-red-700" : "text-slate-800"}`}>
        {value}
      </p>
    </div>
  );
}

function AllocationCard({
  title,
  total,
  donutClassName,
  items,
  negativeValues = false,
}: {
  title: string;
  total: string;
  donutClassName: string;
  items: readonly AllocationItem[];
  negativeValues?: boolean;
}) {
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-xl text-slate-800">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid place-items-center py-2">
          <div className={`donut ${donutClassName}`}>
            <div className="donut-center">
              <strong>{total}</strong>
              <span>Total AUD</span>
            </div>
          </div>
        </div>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.label}>
              <div className="mb-1 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
                <span className={`dot ${item.tone}`} />
                <span>{item.label}</span>
                <span className="text-slate-500">
                  {formatAud(item.amount, { negativeStyle: negativeValues })}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full ${item.tone}`}
                  style={{ width: item.width }}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function MiniCard({
  label,
  value,
  isDanger = false,
}: {
  label: string;
  value: string;
  isDanger?: boolean;
}) {
  return (
    <Card className="rounded-lg border-slate-200 shadow-none">
      <CardContent className="p-3">
        <p className="mb-1 text-xs text-slate-500">{label}</p>
        <div className="flex items-center gap-2">
          <CircleDollarSign className="size-4 text-slate-400" />
          <strong className={isDanger ? "text-red-700" : "text-slate-800"}>
            {value}
          </strong>
        </div>
      </CardContent>
    </Card>
  );
}
