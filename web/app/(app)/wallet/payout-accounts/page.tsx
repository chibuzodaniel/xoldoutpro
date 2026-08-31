"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { BackHeader } from "@/components/ui/BackHeader";
import { useToast } from "@/components/ui/ToastProvider";

type Bank = { code: string; name: string };
type PayoutAccount = {
  id: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  isDefault: boolean;
};

export default function PayoutAccountsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<PayoutAccount[] | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadAccounts() {
    const res = await apiFetch("/api/wallet/payout-accounts");
    if (res.ok) setAccounts((await res.json()).accounts);
  }

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time fetch on mount, not derived render state */
    loadAccounts();
    apiFetch("/api/wallet/banks")
      .then((r) => (r.ok ? r.json() : { banks: [] }))
      .then((d) => setBanks(d.banks));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const bank = banks.find((b) => b.code === bankCode);
      const res = await apiFetch("/api/wallet/payout-accounts", {
        method: "POST",
        body: JSON.stringify({ accountNumber, bankCode, bankName: bank?.name ?? "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not verify that account");
      setAccountNumber("");
      setBankCode("");
      await loadAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetDefault(id: string) {
    await apiFetch(`/api/wallet/payout-accounts/${id}`, { method: "PATCH" });
    await loadAccounts();
  }

  return (
    <div className="pb-6">
      <BackHeader title="Payout accounts" />
      <div className="px-4">

      {accounts && accounts.length > 0 && (
        <div className="flex flex-col divide-y divide-line-soft border-y border-line-soft mb-8">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold">{a.accountName}</p>
                <p className="text-xs text-ink-3">
                  {a.bankName} ···{a.accountNumber.slice(-4)}
                </p>
              </div>
              {a.isDefault ? (
                <span className="text-[11px] uppercase tracking-widest text-red-soft">Default</span>
              ) : (
                <button onClick={() => handleSetDefault(a.id)} className="text-[11px] uppercase tracking-widest text-ink-3">
                  Make default
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <h2 className="text-[12px] uppercase tracking-widest text-ink-3 mb-3">Add an account</h2>
      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <select
          value={bankCode}
          onChange={(e) => setBankCode(e.target.value)}
          required
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
        >
          <option value="">Select bank</option>
          {banks.map((b) => (
            <option key={b.code} value={b.code}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          value={accountNumber}
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="10-digit account number"
          required
          minLength={10}
          maxLength={10}
          inputMode="numeric"
          className="rounded-lg border border-line bg-surface px-4 py-3 text-sm outline-none transition-colors duration-150 focus:border-red"
        />
        <button
          type="submit"
          disabled={busy || !bankCode || accountNumber.length !== 10}
          className="rounded-lg bg-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Verify and add"}
        </button>
      </form>
      </div>
    </div>
  );
}
