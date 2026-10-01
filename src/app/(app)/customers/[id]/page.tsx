import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getPartner, getPartnerBalances } from "@/lib/services/partners";
import { DOC_STATUS_LABELS, listInvoices, listReceipts } from "@/lib/services/receivables";
import { formatMoney } from "@/lib/utils/money";
import { today } from "@/lib/utils/date";
import { ActionButton } from "@/components/forms";
import { PartnerForm } from "@/components/PartnerForm";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { deleteCustomerAction, updateCustomerAction } from "../actions";

export const metadata = { title: "客戶資料" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("customers.view");
  const c = getPartner("customer", Number((await params).id));
  if (!c) notFound();
  const canManage = user.permissions.has("customers.manage");
  const canAr = user.permissions.has("ar.view");
  const canArManage = user.permissions.has("ar.manage");
  const invoices = canAr ? listInvoices({ customerId: c.id }) : [];
  const receipts = canAr ? listReceipts({ customerId: c.id }) : [];
  const outstanding = getPartnerBalances("customer").get(c.id) ?? 0;
  const now = today();
  const overdue = invoices
    .filter((i) => (i.status === "open" || i.status === "partial") && i.due_date < now)
    .reduce((s, i) => s + i.total - i.paid_amount, 0);

  return (
    <>
      <PageHeader
        title={`客戶：${c.code} ${c.name}`}
        description={c.is_active ? undefined : <Badge color="red">停用</Badge>}
        actions={
          <>
            {canArManage && c.is_active ? <LinkButton href={`/receivables/new?customerId=${c.id}`}>開立應收單</LinkButton> : null}
            {canArManage && outstanding > 0 && <LinkButton href={`/receivables/receipts/new?customerId=${c.id}`}>收款沖帳</LinkButton>}
            {canManage && (
              <ActionButton
                action={deleteCustomerAction}
                fields={{ id: c.id }}
                label="刪除客戶"
                variant="danger"
                confirm="確定刪除此客戶？已有交易紀錄之客戶無法刪除，請改為停用。"
              />
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="未收餘額" value={formatMoney(outstanding)} />
        <StatCard label="逾期未收" value={formatMoney(overdue)} tone={overdue > 0 ? "warn" : "default"} />
        <StatCard label="信用額度" value={c.credit_limit ? formatMoney(c.credit_limit) : "不限"} hint={c.credit_limit ? `可用額度 ${formatMoney(Math.max(0, c.credit_limit - outstanding))}` : undefined} />
      </div>

      <Card title="基本資料" className="mb-4 max-w-3xl">
        {canManage ? (
          <PartnerForm kind="customer" action={updateCustomerAction} partner={c} />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">統一編號：</dt><dd className="inline">{c.tax_id}</dd></div>
            <div><dt className="inline text-slate-500">聯絡人：</dt><dd className="inline">{c.contact_person}</dd></div>
            <div><dt className="inline text-slate-500">電話：</dt><dd className="inline">{c.phone}</dd></div>
            <div><dt className="inline text-slate-500">電子郵件：</dt><dd className="inline">{c.email}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">地址：</dt><dd className="inline">{c.address}</dd></div>
            <div><dt className="inline text-slate-500">收款條件：</dt><dd className="inline">{c.payment_terms_days} 天</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">備註：</dt><dd className="inline">{c.notes}</dd></div>
          </dl>
        )}
      </Card>

      {canAr && (
        <>
          <Card title={`應收單（${invoices.length}）`} className="mb-4" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>單號</th>
                  <th>日期</th>
                  <th>到期日</th>
                  <th>發票號碼</th>
                  <th className="num">金額</th>
                  <th className="num">已收</th>
                  <th className="num">未收</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 && <EmptyRow colSpan={8} />}
                {invoices.map((i) => {
                  const open = i.status === "open" || i.status === "partial";
                  return (
                    <tr key={i.id} className={i.status === "void" ? "text-slate-400 line-through" : ""}>
                      <td>
                        <Link href={`/receivables/${i.id}`} className="link font-mono">{i.invoice_no}</Link>
                      </td>
                      <td className="whitespace-nowrap">{i.invoice_date}</td>
                      <td className={`whitespace-nowrap ${open && i.due_date < now ? "font-semibold text-rose-600" : ""}`}>{i.due_date}</td>
                      <td className="font-mono">{i.gui_no}</td>
                      <td className="num">{formatMoney(i.total)}</td>
                      <td className="num">{formatMoney(i.paid_amount, { blankZero: true })}</td>
                      <td className="num">{i.status === "void" ? "" : formatMoney(i.total - i.paid_amount, { blankZero: true })}</td>
                      <td><StatusBadge status={i.status} label={DOC_STATUS_LABELS[i.status]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <Card title={`收款紀錄（${receipts.length}）`} bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>收款單號</th>
                  <th>日期</th>
                  <th>收款科目</th>
                  <th>沖銷單據</th>
                  <th className="num">金額</th>
                  <th>傳票</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 && <EmptyRow colSpan={6} />}
                {receipts.map((r) => (
                  <tr key={r.id} className={r.voucher_status === "void" ? "text-slate-400 line-through" : ""}>
                    <td className="font-mono">{r.receipt_no}</td>
                    <td className="whitespace-nowrap">{r.receipt_date}</td>
                    <td>{r.account_code} {r.account_name}</td>
                    <td className="text-xs">{r.allocations}</td>
                    <td className="num">{formatMoney(r.amount)}</td>
                    <td>{r.voucher_id && <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">{r.voucher_no}</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </>
  );
}
