import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-5">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">
              Support
            </p>
            <h1 className="text-3xl font-bold text-slate-800">Contact & Help</h1>
          </div>
          <Link
            href="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back Dashboard
          </Link>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <Card className="border-slate-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">support@myassets.example</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>Live Chat</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">Mon-Fri 09:00-18:00 AEST</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle>Ticket</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600">Priority response within 1 business day</p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
