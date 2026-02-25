"use client";

import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FinanceKind = "asset" | "liability";

export function AddFinanceItemModal() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState<FinanceKind>("asset");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }

    const nextCategory = category.trim();
    const nextAmount = Number.parseFloat(amount);

    if (!nextCategory) {
      setError("Category is required.");
      return;
    }
    if (!Number.isFinite(nextAmount) || nextAmount < 0) {
      setError("Amount must be a non-negative number.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/data/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          kind,
          category: nextCategory,
          amount: nextAmount,
        }),
      });

      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Failed to add item.");
      }

      setCategory("");
      setAmount("");
      setKind("asset");
      setOpen(false);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Failed to add item."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        className="h-9 bg-cyan-600 hover:bg-cyan-700"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-2xl">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                Add Finance Item
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                aria-label="Close add item modal"
              >
                <X className="size-4" />
              </Button>
            </header>

            <form className="space-y-3" onSubmit={onSubmit}>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Type</span>
                <select
                  value={kind}
                  onChange={(event) => setKind(event.target.value as FinanceKind)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus-visible:border-slate-400 focus-visible:ring-[3px] focus-visible:ring-slate-200"
                  disabled={loading}
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Category</span>
                <Input
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="e.g. Stocks, Mortgage"
                  disabled={loading}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-slate-600">Amount</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0.00"
                  disabled={loading}
                />
              </label>

              {error ? <p className="text-xs text-red-600">{error}</p> : null}

              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    setError("");
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
