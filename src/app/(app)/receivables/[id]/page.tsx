import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPartner } from "@/lib/services/partners";
import { DOC_STATUS_LABELS, getInvoice, getInvoiceLines } from "@/lib/services/receivables";
import { getCompanyInfo } from "@/lib/services/settings";
import { today, toRocDate } from "@/lib/utils/date";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { ActionButton, PrintButton } from "@/components/forms";
import { Alert, Card, EmptyRow, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { voidInvoiceAction } from "../actions";

export const metadata = { title: "應收單明細" };

/** 此應收單之收款沖銷紀錄（作廢之收款已刪除沖銷明細，不會出現） */
function getInvoiceReceipts(invoiceId: number) {
  return getDb()
    .prepare(
      `SELECT r.id, r.receipt_no, r.receipt_date, x.amount, r.voucher_id, v.voucher_no, a.code account_code, a.name account_name
       FROM ar_receipt_allocations x JOIN ar_receipts r ON r.id = x.receipt_id
       JOIN accounts a ON a.id = r.account_id LEFT JOIN vouchers v ON v.id = r.voucher_id
       WHERE x.invoice_id = ? ORDER BY r.receipt_date, r.id`,
    )
    .all(invoiceId) as {
    id: number;
    receipt_no: string;
    receipt_date: string;
    amount: number;
    voucher_id: number | null;
    voucher_no: string | null;
    account_code: string;
    account_name: string;
  }[];
}

export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requirePermission("ar.view");
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const inv = getInvoice(id);
  if (!inv) notFound();
  const lines = getInvoiceLines(id);
  const receipts = getInvoiceReceipts(id);
  const customer = getPartner("customer", inv.customer_id);
  const company = getCompanyInfo();
  const canManage = user.permissions.has("ar.manage");
  const outstanding = inv.total - inv.paid_amount;
  const overdue = (inv.status === "open" || inv.status === "partial") && inv.due_date < today();

  return (
    <>
      <PageHeader
        title={`應收單 ${inv.invoice_no}`}
        actions={
          <>
            <PrintButton />
            <LinkButton href="/receivables">返回列表</LinkButton>
            {canManage && outstanding > 0 && inv.status !== "void" && (
              <LinkButton href={`/receivables/receipts/new?customerId=${inv.customer_id}`} variant="primary">
                收款沖帳
              </LinkButton>
            )}
            {canManage && inv.status !== "void" && inv.paid_amount === 0 && (
              <ActionButton action={voidInvoiceAction} fields={{ id: inv.id }} label="作廢" variant="danger" promptReason="請輸入作廢原因（將連動作廢傳票並回沖庫存）" />
            )}
          </>
        }
      />
      {saved && <Alert tone="success">應收單已開立，並已自動產生傳票 {inv.voucher_no}。</Alert>}
      {inv.status === "void" && <Alert tone="warn">此應收單已作廢，相關傳票已一併作廢。</Alert>}
      {canManage && inv.status !== "void" && inv.paid_amount > 0 && <Alert>此應收單已有收款沖帳，如需作廢請先作廢相關收款單。</Alert>}

      <Card bodyClassName="p-6" className="mb-4">
        <div className="mb-4 text-center">
          <div className="text-lg font-bold">{company.name}</div>
          <div className="text-xl font-bold tracking-widest">應收單</div>
        </div>
        <div className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <span className="text-slate-500">單號：</span>
            <span className="font-mono">{inv.invoice_no}</span>
          </div>
          <div>
            <span className="text-slate-500">發票日期：</span>
            {inv.invoice_date}（民國 {toRocDate(inv.invoice_date)}）
          </div>
          <div>
            <span className="text-slate-500">到期日：</span>
            <span className={overdue ? "font-semibold text-rose-600" : ""}>{inv.due_date}</span>
            {overdue && <span className="ml-1 text-xs text-rose-600">（已逾期）</span>}
          </div>
          <div>
            <span className="text-slate-500">客戶：</span>
            <Link href={`/customers/${inv.customer_id}`} className="link">
              {inv.customer_code} {inv.customer_name}
            </Link>
          </div>
          <div>
            <span className="text-slate-500">統一編號：</span>
            <span className="font-mono">{customer?.tax_id}</span>
          </div>
          <div>
            <span className="text-slate-500">統一發票號碼：</span>
            <span className="font-mono">{inv.gui_no ?? "—"}</span>
          </div>
          <div>
            <span className="text-slate-500">狀態：</span>
            <StatusBadge status={inv.status} label={DOC_STATUS_LABELS[inv.status]} />
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
                <th>收入科目</th>
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
                <td colSpan={6} className="text-right">銷項稅額</td>
                <td className="num">{formatMoney(inv.tax_amount)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">應收總額</td>
                <td className="num">{formatMoney(inv.total)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">已收金額</td>
                <td className="num">{formatMoney(inv.paid_amount)}</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-right">未收餘額</td>
                <td className="num">{inv.status === "void" ? "—" : formatMoney(outstanding)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="收款沖銷紀錄" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>收款單號</th>
              <th>收款日期</th>
              <th>收款科目</th>
              <th className="num">沖銷金額</th>
              <th>傳票</th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && <EmptyRow colSpan={5} message="尚無收款紀錄" />}
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className="font-mono">{r.receipt_no}</td>
                <td>{r.receipt_date}</td>
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
