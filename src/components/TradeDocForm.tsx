"use client";

import { useActionState, useMemo, useState } from "react";
import type { ActionState } from "@/lib/action";
import { FormMessage } from "./forms";

/**
 * 應收單／應付單表單（用戶端元件）：
 * mode = "ar" 開立應收單（銷貨）；mode = "ap" 登錄應付單（進貨／費用）。
 * 金額於畫面上以「元」輸入，送出時以 JSON payload 交由 Server Action 轉換為「分」。
 */

export type TradePartnerOption = { id: number; code: string; name: string; paymentTermsDays: number };
export type TradeProductOption = { id: number; sku: string; name: string; unit: string; price: number; stock: number };
export type TradeAccountOption = { id: number; code: string; name: string };

type Line = { key: number; productId: string; accountId: string; description: string; quantity: string; unitPrice: string };

let seq = 0;
const blank = (): Line => ({ key: ++seq, productId: "", accountId: "", description: "", quantity: "1", unitPrice: "" });

/** 元字串 → 分 */
function toCents(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function toNum(v: string) {
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const fmt = (c: number) => (c / 100).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const qtyFmt = (q: number) => q.toLocaleString("zh-TW", { maximumFractionDigits: 4 });

function addDays(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function TradeDocForm({
  mode,
  action,
  partners,
  products,
  accounts,
  taxRates,
  defaultDate,
  defaultPartnerId,
  defaultAccountLabel,
}: {
  mode: "ar" | "ap";
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  partners: TradePartnerOption[];
  products: TradeProductOption[];
  accounts: TradeAccountOption[];
  taxRates: { value: number; label: string }[];
  defaultDate: string;
  defaultPartnerId?: number;
  /** 未選擇科目時之預設科目說明，例：「4111 銷貨收入」 */
  defaultAccountLabel: string;
}) {
  const isAr = mode === "ar";
  const [state, formAction, pending] = useActionState(action, {});
  const [partnerId, setPartnerId] = useState(defaultPartnerId && partners.some((p) => p.id === defaultPartnerId) ? String(defaultPartnerId) : "");
  const [docDate, setDocDate] = useState(defaultDate);
  const [dueDate, setDueDate] = useState("");
  const [ref, setRef] = useState("");
  const [description, setDescription] = useState("");
  const [taxRate, setTaxRate] = useState(String(taxRates[0]?.value ?? 0.05));
  const [lines, setLines] = useState<Line[]>(() => [blank()]);

  const partner = partners.find((p) => String(p.id) === partnerId);
  const autoDue = partner ? addDays(docDate, partner.paymentTermsDays) : "";
  const productMap = useMemo(() => new Map(products.map((p) => [String(p.id), p])), [products]);

  const amounts = lines.map((l) => Math.round(toNum(l.quantity) * toCents(l.unitPrice)));
  const subtotal = amounts.reduce((s, a) => s + a, 0);
  const rate = Number(taxRate) || 0;
  // 與伺服器端 calcTax 一致：稅額四捨五入至元
  const tax = Math.round((subtotal * rate) / 100) * 100;
  const total = subtotal + tax;

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const chooseProduct = (l: Line, productId: string) => {
    const p = productMap.get(productId);
    if (!p) {
      update(l.key, { productId: "" });
      return;
    }
    const prevProduct = productMap.get(l.productId);
    update(l.key, {
      productId,
      accountId: "",
      description: !l.description || (prevProduct && l.description === prevProduct.name) ? p.name : l.description,
      unitPrice: String(p.price / 100),
    });
  };

  const payload = JSON.stringify({
    partnerId: Number(partnerId) || 0,
    docDate,
    dueDate: dueDate || null,
    ref: ref || null,
    description: description || null,
    taxRate: rate,
    lines: lines
      .filter((l) => l.productId || l.description.trim() || l.unitPrice)
      .map((l) => ({
        productId: Number(l.productId) || null,
        accountId: l.productId ? null : Number(l.accountId) || null,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
  });

  const stockWarnings = isAr
    ? lines
        .filter((l) => l.productId)
        .map((l) => ({ p: productMap.get(l.productId)!, q: toNum(l.quantity) }))
        .filter(({ p, q }) => p && q > p.stock)
    : [];

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="payload" value={payload} />

      <div className="card grid gap-4 p-4 sm:grid-cols-4">
        <label className="block sm:col-span-2">
          <span className="label">{isAr ? "客戶" : "供應商"}</span>
          <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required>
            <option value="">請選擇{isAr ? "客戶" : "供應商"}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.name}（{p.paymentTermsDays} 天）
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">{isAr ? "發票日期" : "帳單日期"}</span>
          <input type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value)} required />
        </label>
        <label className="block">
          <span className="label">到期日</span>
          <input type="date" className="input" value={dueDate} min={docDate} onChange={(e) => setDueDate(e.target.value)} />
          <span className="mt-1 block text-xs text-slate-400">{autoDue ? `空白則依付款條件為 ${autoDue}` : "空白則依付款條件自動計算"}</span>
        </label>
        <label className="block">
          <span className="label">{isAr ? "統一發票號碼" : "廠商發票號碼"}</span>
          <input className="input font-mono" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="例：AB12345678" maxLength={20} />
        </label>
        <label className="block">
          <span className="label">稅別</span>
          <select className="input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)}>
            {taxRates.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">摘要</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isAr ? "例：十月份商品銷貨" : "例：十月份進貨"} />
        </label>
      </div>

      <div className="card overflow-x-auto">
        <table className="table min-w-[1000px]">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-56">商品</th>
              <th className="w-56">{isAr ? "收入科目" : "費用／資產科目"}</th>
              <th>品名／說明</th>
              <th className="num w-24">數量</th>
              <th className="num w-32">單價（元）</th>
              <th className="num w-32">金額</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const p = productMap.get(l.productId);
              return (
                <tr key={l.key}>
                  <td className="pt-3 text-slate-400">{i + 1}</td>
                  <td>
                    <select className="input" value={l.productId} onChange={(e) => chooseProduct(l, e.target.value)}>
                      <option value="">（非商品）</option>
                      {products.map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          {pr.sku} {pr.name}
                          {isAr ? `（庫存 ${qtyFmt(pr.stock)}${pr.unit}）` : ""}
                        </option>
                      ))}
                    </select>
                    {p && (
                      <span className="mt-1 block text-xs text-slate-400">
                        {isAr ? `庫存 ${qtyFmt(p.stock)} ${p.unit}` : `平均成本 ${fmt(p.price)}／${p.unit}，庫存 ${qtyFmt(p.stock)}`}
                      </span>
                    )}
                  </td>
                  <td>
                    <select className="input" value={l.productId ? "" : l.accountId} disabled={!!l.productId} onChange={(e) => update(l.key, { accountId: e.target.value })}>
                      <option value="">{l.productId ? (isAr ? "（商品：銷貨收入）" : "（商品：存貨）") : `預設：${defaultAccountLabel}`}</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input className="input" value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} placeholder={p ? p.name : "品名或說明"} />
                  </td>
                  <td>
                    <input className="input text-right" inputMode="decimal" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                  </td>
                  <td>
                    <input className="input text-right" inputMode="decimal" value={l.unitPrice} onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
                  </td>
                  <td className="num pt-3">{fmt(amounts[i])}</td>
                  <td>
                    <button type="button" className="btn btn-sm" title="刪除此列" disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>
                <button type="button" className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                  ＋ 新增明細
                </button>
              </td>
              <td className="num"></td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={6} className="text-right">未稅金額</td>
              <td className="num">{fmt(subtotal)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={6} className="text-right">{isAr ? "銷項稅額" : "進項稅額"}</td>
              <td className="num">{fmt(tax)}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={6} className="text-right font-semibold">{isAr ? "應收總額" : "應付總額"}</td>
              <td className="num font-semibold">{fmt(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {stockWarnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          庫存不足：{stockWarnings.map(({ p, q }) => `${p.name}（需 ${qtyFmt(q)}，庫存 ${qtyFmt(p.stock)}）`).join("、")}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={pending || !partnerId || total <= 0}>
          {pending ? "儲存中…" : isAr ? "開立應收單" : "登錄應付單"}
        </button>
        <span className="text-xs text-slate-500">
          儲存後將自動產生並過帳傳票{isAr ? "（含銷貨成本與存貨出庫）" : "（商品明細將入庫並以存貨科目入帳）"}。
        </span>
      </div>
    </form>
  );
}
