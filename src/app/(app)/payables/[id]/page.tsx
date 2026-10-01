import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPartner } from "@/lib/services/partners";
import { BILL_STATUS_LABELS, getBill, getBillLines } from "@/lib/services/payables";
import { getCompanyInfo } from "@/lib/services/settings";
import { today, toRocDate } from "@/lib/utils/date";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { ActionButton, PrintButton } from "@/components/forms";
import { Alert, Card, EmptyRow, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { voidBillAction } from "../actions";

export const metadata = { title: "應付單明細" };

/** 此應付單之付款沖銷紀錄（作廢之付款已刪除沖銷明細，不會出現） */
function getBillPayments(billId: number) {
  return getDb()
    .prepare(
      `SELECT r.id, r.payment_no, r.payment_date, x.amount, r.voucher_id, v.voucher_no, a.code account_code, a.name account_name
       FROM ap_payment_allocations x JOIN ap_payments r ON r.id = x.payment_id
       JOIN accounts a ON a.id = r.account_id LEFT JOIN vouchers v ON v.id = r.voucher_id
       WHERE x.bill_id = ? ORDER BY r.payment_date, r.id`,
    )
    .all(billId) as {
    id: number;
    payment_no: string;
    payment_date: string;
    amount: number;
    voucher_id: number | null;
    voucher_no: string | null;
    account_code: string;
    account_name: string;
  }[];
}

export default async function BillDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requirePermission("ap.view");
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const inv = getBill(id);
  if (!inv) notFound();
  const lines = getBillLines(id);
  const payments = getBillPayments(id);
  const vendor = getPartner("vendor", inv.vendor_id);
  const company = getCompanyInfo();
  const canManage = user.permissions.has("ap.manage");
  const outstanding = inv.total - inv.paid_amount;
  const overdue = (inv.status === "open" || inv.status === "partial") && inv.due_date < today();

  return (
    <>
      <PageHeader
        title={`應付單 ${inv.bill_no}`}
        actions={
          <>
            <PrintButton />
            <LinkButton href="/payables">返回列表</LinkButton>
            {canManage && outstanding > 0 && inv.status !== "void" && (
              <LinkButton href={`/payables/payments/new?vendorId=${inv.vendor_id}`} variant="primary">
                付款沖帳
              </LinkButton>
            )}
            {canManage && inv.status !== "void" && inv.paid_amount === 0 && (
              <ActionButton action={voidBillAction} fields={{ id: inv.id }} label="作廢" variant="danger" promptReason="請輸入作廢原因（將連動作廢傳票並沖回庫存）" />
            )}
          </>
        }
      />
      {saved && <Alert tone="success">應付單已登錄，並已自動產生傳票 {inv.voucher_no}。</Alert>}
      {inv.status === "void" && <Alert tone="warn">此應付單已作廢，相關傳票已一併作廢。</Alert>}
      {canManage && inv.status !== "void" && inv.paid_amount > 0 && <Alert>此應付單已有付款沖帳，如需作廢請先作廢相關付款單。</Alert>}

      <Card bodyClassName="p-6" className="mb-4">
        <div className="mb-4 text-center">
          <div className="text-lg font-bold">{company.name}</div>
          <div className="text-xl font-bold tracking-widest">應付單</div>
        </div>
        <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-slate-500">單號：</span>
            <span className="font-mono">{inv.bill_no}</span>
          </div>
          <div>
            <span className="text-slate-500">帳單日期：</span>
            {inv.bill_date}（民國 {toRocDate(inv.bill_date)}）
          </div>
          <div>
            <span className="text-slate-500">到期日：</span>
            <span className={overdue ? "font-semibold text-rose-600" : ""}>{inv.due_date}</span>
            {overdue && <span className="ml-1 text-xs text-rose-600">（已逾期）</span>}
          </div>
          <div>
            <span className="text-slate-500">供應商：</span>
            <Link href={`/vendors/${inv.vendor_id}`} className="link">
              {inv.vendor_code} {inv.vendor_name}
            </Link>
          </div>
          <div>
            <span className="text-slate-500">統一編號：</span>
            <span className="font-mono">{vendor?.tax_id}</span>
          </div>
          <div>
            <span className="text-slate-500">廠商發票號碼：</span>
            <span className="font-mono">{inv.vendor_ref ?? "—"}</span>
          </div>
          <div>
            <span className="text-slate-500">狀態：</span>
            <StatusBadge status={inv.status} label={BILL_STATUS_LABELS[inv.status]} />
          </div>
          <div>
            <span className="text-slate-500">傳票：</span>
            {inv.voucher_id ? (
              <Link href={`/vouchers/${inv.voucher_id}`} className="link font-mono">
                {inv.voucher_no}
              </Link>
            ) : (
              "—"
            )}
          </div>
          <div>
            <span className="text-slate-500">稅別：</span>
            {inv.tax_rate > 0 ? `應稅 ${inv.tax_rate * 100}%` : "零稅率／免稅"}
          </div>
          {inv.description && (
            <div className="sm:col-span-3">
              <span className="text-slate-500">摘要：</span>
              {inv.description}
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>商品編號</th>
                <th>品名／說明</th>
                <th>入帳科目</th>
                <th className="num">數量</th>
                <th className="num">單價</th>
                <th className="num">金額</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="text-slate-400">{l.line_no}</td>
                  <td className="font-mono">{l.sku}</td>
                  <td>{l.description}</td>
                  <td className="text-xs text-slate-600">
                    {l.account_code} {l.account_name}
                  </td>
                  <td className="num">
                    {formatQty(l.quantity)} {l.unit}
                  </td>
                  <td className="num">{formatMoney(l.unit_price)}</td>
                  <td className="num">{formatMoney(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="text-right">未稅金額</td>
                <td className="num">{formatMoney(inv.subtotal)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">進項稅額</td>
                <td className="num">{formatMoney(inv.tax_amount)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">應付總額</td>
                <td className="num">{formatMoney(inv.total)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">已付金額</td>
                <td className="num">{formatMoney(inv.paid_amount)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">未付餘額</td>
                <td className="num">{inv.status === "void" ? "—" : formatMoney(outstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="付款沖銷紀錄" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>付款單號</th>
              <th>付款日期</th>
              <th>付款科目</th>
              <th className="num">沖銷金額</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && <EmptyRow colSpan={5} message="尚無付款紀錄" />}
            {payments.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.payment_no}</td>
                <td>{r.payment_date}</td>
                <td>
                  {r.account_code} {r.account_name}
                </td>
                <td className="num">{formatMoney(r.amount)}</td>
                <td>
                  {r.voucher_id && (
                    <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">
                      {r.voucher_no}
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
