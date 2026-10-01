"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage } from "./forms";

/**
 * 收款／付款沖帳表單（用戶端元件）：
 * mode = "ar" 客戶收款沖銷應收單；mode = "ap" 供應商付款沖銷應付單。
 * 未輸入任何沖銷金額時，可直接輸入收付金額，由系統依到期日先後自動沖銷。
 */

export type SettlementPartnerOption = { id: number; code: string; name: string };
export type SettlementDocOption = {
  id: number;
  partnerId: number;
  docNo: string;
  docDate: string;
  dueDate: string;
  ref: string | null;
  total: number; // 分
  outstanding: number; // 分
};

function toCents(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
const fmt = (c: number) => (c / 100).toLocaleString("zh-TW", { maximumFractionDigits: 2 });

export function SettlementForm({
  mode,
  action,
  partners,
  docs,
  cashAccounts,
  defaultDate,
  defaultPartnerId,
}: {
  mode: "ar" | "ap";
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  partners: SettlementPartnerOption[];
  docs: SettlementDocOption[];
  cashAccounts: { id: number; code: string; name: string }[];
  defaultDate: string;
  defaultPartnerId?: number;
}) {
  const isAr = mode === "ar";
  const verb = isAr ? "收款" : "付款";
  const [state, formAction, pending] = useActionState(action, {});
  const [partnerId, setPartnerId] = useState(defaultPartnerId && partners.some((p) => p.id === defaultPartnerId) ? String(defaultPartnerId) : "");
  const [date, setDate] = useState(defaultDate);
  const [accountId, setAccountId] = useState(cashAccounts[0] ? String(cashAccounts[0].id) : "");
  const [description, setDescription] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [alloc, setAlloc] = useState<Record<number, string>>({});

  const partnerDocs = docs.filter((d) => String(d.partnerId) === partnerId).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id);
  const partnerOutstanding = partnerDocs.reduce((s, d) => s + d.outstanding, 0);
  const allocCents = partnerDocs.map((d) => (alloc[d.id] ? toCents(alloc[d.id]) : 0));
  const invalid = partnerDocs.some((d, i) => Number.isNaN(allocCents[i]) || allocCents[i] < 0 || allocCents[i] > d.outstanding);
  const allocTotal = allocCents.reduce((s, a) => s + (Number.isNaN(a) ? 0 : a), 0);
  const useAllocations = allocTotal > 0;
  const manualCents = manualAmount ? toCents(manualAmount) : 0;
  const amount = useAllocations ? allocTotal : Number.isNaN(manualCents) ? 0 : manualCents;
  const overManual = !useAllocations && amount > partnerOutstanding;

  const choosePartner = (id: string) => {
    setPartnerId(id);
    setAlloc({});
    setManualAmount("");
  };
  const fillAll = () => setAlloc(Object.fromEntries(partnerDocs.map((d) => [d.id, String(d.outstanding / 100)])));
  const clearAll = () => setAlloc({});

  const payload = JSON.stringify({
    partnerId: Number(partnerId) || 0,
    date,
    accountId: Number(accountId) || 0,
    description: description || null,
    amount: useAllocations ? "" : manualAmount,
    allocations: useAllocations
      ? partnerDocs.filter((d) => alloc[d.id] && toCents(alloc[d.id]) > 0).map((d) => ({ docId: d.id, amount: alloc[d.id] }))
      : [],
  });

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="payload" value={payload} />

      <div className="card grid gap-4 p-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="label">{isAr ? "客戶" : "供應商"}</span>
          <select className="input" value={partnerId} onChange={(e) => choosePartner(e.target.value)} required>
            <option value="">請選擇{isAr ? "客戶" : "供應商"}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{verb}日期</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">{verb}科目（現金／銀行）</span>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} required>
            <option value="">請選擇</option>
            {cashAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-4">
          <span className="label">摘要</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isAr ? "例：電匯收款、支票兌現" : "例：電匯付款、開立支票"} />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="text-sm font-semibold">
            未結清{isAr ? "應收單" : "應付單"}
            {partnerId && <span className="ml-2 font-normal text-slate-500">未{isAr ? "收" : "付"}合計 {fmt(partnerOutstanding)} 元</span>}
          </h2>
          {partnerDocs.length > 0 && (
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={fillAll}>
                全額沖銷
              </button>
              <button type="button" className="btn btn-sm" onClick={clearAll}>
                清除
              </button>
            </div>
          )}
        </header>
        <table className="table min-w-[800px]">
          <thead>
            <tr>
              <th>單號</th>
              <th>單據日期</th>
              <th>到期日</th>
              <th>發票號碼</th>
              <th className="num">單據金額</th>
              <th className="num">未{isAr ? "收" : "付"}餘額</th>
              <th className="num w-40">本次沖銷（元）</th>
            </tr>
          </thead>
          <tbody>
            {!partnerId && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  請先選擇{isAr ? "客戶" : "供應商"}
                </td>
              </tr>
            )}
            {partnerId && partnerDocs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-slate-400">
                  此{isAr ? "客戶" : "供應商"}無未結清單據
                </td>
              </tr>
            )}
            {partnerDocs.map((d, i) => {
              const bad = Number.isNaN(allocCents[i]) || allocCents[i] < 0 || allocCents[i] > d.outstanding;
              return (
                <tr key={d.id}>
                  <td className="font-mono">{d.docNo}</td>
                  <td className="whitespace-nowrap">{d.docDate}</td>
                  <td className={`whitespace-nowrap ${d.dueDate < date ? "font-semibold text-rose-600" : ""}`}>{d.dueDate}</td>
                  <td className="font-mono">{d.ref}</td>
                  <td className="num">{fmt(d.total)}</td>
                  <td className="num">{fmt(d.outstanding)}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <input
                        className={`input text-right ${bad ? "border-rose-400" : ""}`}
                        inputMode="decimal"
                        value={alloc[d.id] ?? ""}
                        onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: e.target.value }))}
                      />
                      <button type="button" className="btn btn-sm" title="全額" onClick={() => setAlloc((a) => ({ ...a, [d.id]: String(d.outstanding / 100) }))}>
                        全
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {partnerDocs.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} className="text-right">
                  沖銷合計
                </td>
                <td className="num">{fmt(allocTotal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="card grid gap-4 p-4 sm:grid-cols-4">
        <label className="block">
          <span className="label">{verb}金額（元）</span>
          {useAllocations ? (
            <input className="input text-right" value={fmt(allocTotal)} readOnly disabled />
          ) : (
            <input className="input text-right" inputMode="decimal" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} disabled={!partnerId} />
          )}
        </label>
        <div className="self-end text-xs text-slate-500 sm:col-span-3">
          {useAllocations
            ? `${verb}金額為上表沖銷合計。`
            : `未指定沖銷明細時，請直接輸入${verb}金額，系統將依到期日先後自動沖銷（不可超過未${isAr ? "收" : "付"}餘額）。`}
          {overManual && <span className="ml-2 text-rose-600">金額超過未{isAr ? "收" : "付"}餘額</span>}
          {invalid && <span className="ml-2 text-rose-600">沖銷金額不可為負數或超過該單據未{isAr ? "收" : "付"}餘額</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !partnerId || !accountId || amount <= 0 || invalid || overManual}>
          {pending ? "儲存中…" : `確認${verb}`}
        </button>
        <span className="text-xs text-slate-500">儲存後將自動產生並過帳{isAr ? "收入" : "支出"}傳票。</span>
      </div>
    </form>
  );
}
