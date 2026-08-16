"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type PayoutAccount = { id: string; bankName: string; accountNumber: string; accountName: string; isDefault: boolean };

function naira(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

export default function WithdrawPage() {
  const router = useRouter();
  const [availableKobo, setAvailableKobo] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [payoutAccountId, setPayoutAccountId] = useState("");
  const [amountNaira, setAmountNaira] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [walletRes, accountsRes] = await Promise.all([
        apiFetch("/api/wallet"),
        apiFetch("/api/wallet/payout-accounts"),
      ]);
      if (walletRes.ok) setAvailableKobo((await walletRes.json()).availableKobo);
      if (accountsRes.ok) {
        const { accounts: list } = await accountsRes.json();
        setAccounts(list);
        setPayoutAccountId(list.find((a: PayoutAccount) => a.isDefault)?.id ?? list[0]?.id ?? "");
      }
    }
    load();
  }, []);

  const amountKobo = Math.round(parseFloat(amountNaira || "0") * 100);
  const netKobo = amountKobo; // fee is 0 — platform absorbs it

  function setPercent(pct: number) {
    if (availableKobo === null) return;
    setAmountNaira(((Math.floor((availableKobo * pct) / 100) / 100).toFixed(2)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!payoutAccountId) return setError("Add a payout account first");
    if (!amountKobo || amountKobo <= 0) return setError("Enter an amount");
    if (availableKobo !== null && amountKobo > availableKobo) return setError("Amount exceeds available balance");

    setBusy(true);
    try {
      const res = await apiFetch("/api/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({ amountKobo, payoutAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start withdrawal");
      router.push("/wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (accounts.length === 0 && availableKobo !== null) {
    return (
      <div className="px-4 py-6">
        <h1 className="font-serif text-2xl mb-4">Withdraw</h1>
        <p className="text-sm text-ink-3 mb-4">Add a payout account before you can withdraw.</p>
        <Link href="/wallet/payout-accounts" className="text-sm text-red-soft font-semibold">
          Add payout account →
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <h1 className="font-serif text-2xl mb-2">Withdraw</h1>
      <p className="text-sm text-ink-3 mb-6">{availableKobo !== null ? `${naira(availableKobo)} available` : "Loading…"}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="text-lg text-ink-3">₦</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amountNaira}
            onChange={(e) => setAmountNaira(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface px-4 py-3 text-lg outline-none transition-colors duration-150 focus:border-red"
          />
        </div>
        <div className="flex gap-2">
          {[25, 50, 100].map((pct) => (
            <button
              type="button"
              key={pct}
              onClick={() => setPercent(pct)}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold"
            >
              {pct === 100 ? "Max" : `${pct}%`}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-widest text-ink-3">Destination account</label>
          <select
            value={payoutAccountId}
            onChange={(e) => setPayoutAccountId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} ···{a.accountNumber.slice(-4)} — {a.accountName}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
          <div className="flex justify-between text-ink-3 mb-1">
            <span>Fee</span>
            <span>₦0</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>You receive</span>
            <span className="font-serif">{naira(netKobo)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-soft">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Sending…" : "Withdraw"}
        </button>
      </form>
    </div>
  );
}
