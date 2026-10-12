import Link from "next/link";
import type { ActionState } from "@/lib/action";
import { formatMoney } from "@/lib/utils/money";
import { ActionButton, ActionForm, SubmitButton } from "./forms";
import { Badge, Card, EmptyRow, Field } from "./ui";

type Row = {
  id: number;
  allowance_no: string;
  allowance_date: string;
  amount: number;
  tax_amount: number;
  reason: string | null;
  status: "active" | "void";
  voucher_id: number | null;
  voucher_no: string | null;
};

/**
 * 應收單／應付單明細頁之折讓區塊：折讓紀錄與開立折讓單表單。
 * 折讓金額為未稅金額，稅額依原單據稅率自動計算。
 */
export function AllowanceSection({
  mode,
  docId,
  rows,
  canCreate,
  maxAmount,
  defaultDate,
  taxRate,
  createAction,
  voidAction,
}: {
  mode: "ar" | "ap";
  docId: number;
  rows: Row[];
  canCreate: boolean;
  maxAmount: number;
  defaultDate: string;
  taxRate: number;
  createAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  voidAction: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const title = mode === "ar" ? "銷貨退回或折讓證明單" : "進貨退出或折讓證明單";
  return (
    <Card title={title} className="mt-4" bodyClassName="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>折讓單號</th>
            <th>日期</th>
            <th>原因</th>
            <th className="num">折讓金額（未稅）</th>
            <th className="num">稅額</th>
            <th>傳票</th>
            <th>狀態</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow colSpan={8} message="尚無折讓紀錄" />}
          {rows.map((r) => (
            <tr key={r.id} className={r.status === "void" ? "text-slate-400 line-through" : ""}>
              <td className="font-mono">{r.allowance_no}</td>
              <td className="whitespace-nowrap">{r.allowance_date}</td>
              <td>{r.reason}</td>
              <td className="num">{formatMoney(r.amount)}</td>
              <td className="num">{formatMoney(r.tax_amount)}</td>
              <td>
                {r.voucher_id && (
                  <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">
                    {r.voucher_no}
                  </Link>
                )}
              </td>
              <td>{r.status === "void" ? <Badge>已作廢</Badge> : <Badge color="green">有效</Badge>}</td>
              <td>
                {canCreate && r.status === "active" && (
                  <ActionButton action={voidAction} fields={{ id: r.id }} label="作廢" size="sm" variant="danger" promptReason={`請輸入折讓單 ${r.allowance_no} 之作廢原因`} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canCreate && maxAmount > 0 && (
        <div className="border-t border-slate-200 p-4 print:hidden">
          <ActionForm action={createAction} className="space-y-3">
            <input type="hidden" name="docId" value={docId} />
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="折讓日期">
                <input type="date" name="date" className="input" defaultValue={defaultDate} required />
              </Field>
              <Field label="折讓金額（未稅，元）" hint={`上限 ${formatMoney(maxAmount)}；稅額依 ${Math.round(taxRate * 100)}% 自動計算`}>
                <input name="amount" className="input text-right" inputMode="decimal" required />
              </Field>
              <Field label="折讓原因" className="sm:col-span-2">
                <input name="reason" className="input" placeholder={mode === "ar" ? "例：商品瑕疵折讓" : "例：進貨品質不良折讓"} required />
              </Field>
            </div>
            <SubmitButton>開立折讓單</SubmitButton>
          </ActionForm>
        </div>
      )}
    </Card>
  );
}
