"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage } from "./forms";

type Option = { id: number; code?: string; name: string };
type Line = { key: number; accountId: string; description: string; debit: string; credit: string; partner: string };

export type VoucherFormInitial = {
  id?: number;
  voucherDate: string;
  voucherType: string;
  description: string;
  lines: { accountId: number; description: string; debit: string; credit: string; partner: string }[];
};

let seq = 0;
const blank = (): Line => ({ key: ++seq, accountId: "", description: "", debit: "", credit: "", partner: "" });

function parse(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

const fmt = (c: number) => (c / 100).toLocaleString("zh-TW", { maximumFractionDigits: 2 });

export function VoucherForm({
  action,
  accounts,
  customers,
  vendors,
  initial,
  autoPostHint,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  accounts: Option[];
  customers: Option[];
  vendors: Option[];
  initial: VoucherFormInitial;
  autoPostHint?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [date, setDate] = useState(initial.voucherDate);
  const [type, setType] = useState(initial.voucherType);
  const [description, setDescription] = useState(initial.description);
  const [lines, setLines] = useState<Line[]>(() => {
    const ls = initial.lines.map((l) => ({ ...l, key: ++seq, accountId: String(l.accountId) }));
    while (ls.length < 2) ls.push(blank());
    return ls;
  });

  const totals = useMemo(() => {
    const debit = lines.reduce((s, l) => s + parse(l.debit), 0);
    const credit = lines.reduce((s, l) => s + parse(l.credit), 0);
    return { debit, credit, diff: debit - credit };
  }, [lines]);

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /** 以差額自動補平該列 */
  const balanceLine = (l: Line) => {
    const others = lines.filter((x) => x.key !== l.key);
    const d = others.reduce((s, x) => s + parse(x.debit) - parse(x.credit), 0);
    if (d > 0) update(l.key, { credit: String(d / 100), debit: "" });
    else if (d < 0) update(l.key, { debit: String(-d / 100), credit: "" });
  };

  const payload = JSON.stringify({
    voucherDate: date,
    voucherType: type,
    description,
    lines: lines.filter((l) => l.accountId || l.debit || l.credit).map(({ key: _k, ...l }) => l),
  });

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="payload" value={payload} />

      <div className="card grid gap-4 p-4 sm:grid-cols-4">
        <label className="block">
          <span className="label">傳票日期</span>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">傳票類別</span>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="receipt">收入傳票</option>
            <option value="payment">支出傳票</option>
            <option value="transfer">轉帳傳票</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">傳票摘要</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例：支付十月份辦公室租金" />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[900px]">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-64">會計科目</th>
              <th>摘要</th>
              <th className="w-44">往來對象</th>
              <th className="num w-32">借方金額</th>
              <th className="num w-32">貸方金額</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key}>
                <td className="pt-3 text-slate-400">{i + 1}</td>
                <td>
                  <select className="input" value={l.accountId} onChange={(e) => update(l.key, { accountId: e.target.value })}>
                    <option value="">請選擇科目</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder="（空白則沿用傳票摘要）" />
                </td>
                <td>
                  <select className="input" value={l.partner} onChange={(e) => update(l.key, { partner: e.target.value })}>
                    <option value="">—</option>
                    <optgroup label="客戶">
                      {customers.map((c) => (
                        <option key={`c${c.id}`} value={`customer:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="供應商">
                      {vendors.map((v) => (
                        <option key={`v${v.id}`} value={`vendor:${v.id}`}>
                          {v.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </td>
                <td>
                  <input className="input text-right" inputMode="decimal" value={l.debit} onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
                </td>
                <td>
                  <input className="input text-right" inputMode="decimal" value={l.credit} onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
                </td>
                <td className="whitespace-nowrap">
                  <button type="button" className="btn btn-sm" title="以差額補平" onClick={() => balanceLine(l)}>
                    補平
                  </button>{" "}
                  <button type="button" className="btn btn-sm" title="刪除此列" disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                  ＋ 新增分錄
                </button>
                <span className={`ml-4 text-sm ${totals.diff === 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {totals.diff === 0 ? (totals.debit > 0 ? "借貸平衡" : "") : `借貸差額 ${fmt(Math.abs(totals.diff))}（${totals.diff > 0 ? "借方" : "貸方"}較多）`}
                </span>
              </td>
              <td className="num">{fmt(totals.debit)}</td>
              <td className="num">{fmt(totals.credit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || totals.diff !== 0 || totals.debit === 0}>
          {pending ? "儲存中…" : "儲存傳票"}
        </button>
        {autoPostHint && <span className="text-xs text-slate-500">{autoPostHint}</span>}
      </div>
    </form>
  );
}
