import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getPartner, getPartnerBalances } from "@/lib/services/partners";
import { BILL_STATUS_LABELS, listBills, listPayments } from "@/lib/services/payables";
import { formatMoney } from "@/lib/utils/money";
import { today } from "@/lib/utils/date";
import { ActionButton } from "@/components/forms";
import { PartnerForm } from "@/components/PartnerForm";
import { Badge, Card, EmptyRow, LinkButton, PageHeader, StatCard, StatusBadge } from "@/components/ui";
import { deleteVendorAction, updateVendorAction } from "../actions";

export const metadata = { title: "供應商資料" };

export default async function VendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("vendors.view");
  const v = getPartner("vendor", Number((await params).id));
  if (!v) notFound();
  const canManage = user.permissions.has("vendors.manage");
  const canAp = user.permissions.has("ap.view");
  const canApManage = user.permissions.has("ap.manage");
  const bills = canAp ? listBills({ vendorId: v.id }) : [];
  const payments = canAp ? listPayments({ vendorId: v.id }) : [];
  const outstanding = getPartnerBalances("vendor").get(v.id) ?? 0;
  const now = today();
  const overdue = bills
    .filter((b) => (b.status === "open" || b.status === "partial") && b.due_date < now)
    .reduce((s, b) => s + b.total - b.paid_amount, 0);

  return (
    <>
      <PageHeader
        title={`供應商：${v.code} ${v.name}`}
        description={v.is_active ? undefined : <Badge color="red">停用</Badge>}
        actions={
          <>
            {canApManage && v.is_active ? <LinkButton href={`/payables/new?vendorId=${v.id}`}>登錄應付單</LinkButton> : null}
            {canApManage && outstanding > 0 && <LinkButton href={`/payables/payments/new?vendorId=${v.id}`}>付款沖帳</LinkButton>}
            {canManage && (
              <ActionButton
                action={deleteVendorAction}
                fields={{ id: v.id }}
                label="刪除供應商"
                variant="danger"
                confirm="確定刪除此供應商？已有交易紀錄之供應商無法刪除，請改為停用。"
              />
            )}
          </>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="未付餘額" value={formatMoney(outstanding)} />
        <StatCard label="逾期未付" value={formatMoney(overdue)} tone={overdue > 0 ? "warn" : "default"} />
        <StatCard label="付款條件" value={`${v.payment_terms_days} 天`} hint={v.bank_account ?? undefined} />
      </div>

      <Card title="基本資料" className="mb-4 max-w-3xl">
        {canManage ? (
          <PartnerForm kind="vendor" action={updateVendorAction} partner={v} />
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="inline text-slate-500">統一編號：</dt><dd className="inline">{v.tax_id}</dd></div>
            <div><dt className="inline text-slate-500">聯絡人：</dt><dd className="inline">{v.contact_person}</dd></div>
            <div><dt className="inline text-slate-500">電話：</dt><dd className="inline">{v.phone}</dd></div>
            <div><dt className="inline text-slate-500">電子郵件：</dt><dd className="inline">{v.email}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">地址：</dt><dd className="inline">{v.address}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">匯款帳戶：</dt><dd className="inline">{v.bank_account}</dd></div>
            <div className="sm:col-span-2"><dt className="inline text-slate-500">備註：</dt><dd className="inline">{v.notes}</dd></div>
          </dl>
        )}
      </Card>

      {canAp && (
        <>
          <Card title={`應付單（${bills.length}）`} className="mb-4" bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>單號</th>
                  <th>日期</th>
                  <th>到期日</th>
                  <th>廠商發票號碼</th>
                  <th className="num">金額</th>
                  <th className="num">已付</th>
                  <th className="num">未付</th>
                  <th>狀態</th>
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 && <EmptyRow colSpan={8} />}
                {bills.map((b) => {
                  const open = b.status === "open" || b.status === "partial";
                  return (
                    <tr key={b.id} className={b.status === "void" ? "text-slate-400 line-through" : ""}>
                      <td>
                        <Link href={`/payables/${b.id}`} className="link font-mono">{b.bill_no}</Link>
                      </td>
                      <td className="whitespace-nowrap">{b.bill_date}</td>
                      <td className={`whitespace-nowrap ${open && b.due_date < now ? "font-semibold text-rose-600" : ""}`}>{b.due_date}</td>
                      <td className="font-mono">{b.vendor_ref}</td>
                      <td className="num">{formatMoney(b.total)}</td>
                      <td className="num">{formatMoney(b.paid_amount, { blankZero: true })}</td>
                      <td className="num">{b.status === "void" ? "" : formatMoney(b.total - b.paid_amount, { blankZero: true })}</td>
                      <td><StatusBadge status={b.status} label={BILL_STATUS_LABELS[b.status]} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <Card title={`付款紀錄（${payments.length}）`} bodyClassName="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>付款單號</th>
                  <th>日期</th>
                  <th>付款科目</th>
                  <th>沖銷單據</th>
                  <th className="num">金額</th>
                  <th>傳票</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && <EmptyRow colSpan={6} />}
                {payments.map((p) => (
                  <tr key={p.id} className={p.voucher_status === "void" ? "text-slate-400 line-through" : ""}>
                    <td className="font-mono">{p.payment_no}</td>
                    <td className="whitespace-nowrap">{p.payment_date}</td>
                    <td>{p.account_code} {p.account_name}</td>
                    <td className="text-xs">{p.allocations}</td>
                    <td className="num">{formatMoney(p.amount)}</td>
                    <td>{p.voucher_id && <Link href={`/vouchers/${p.voucher_id}`} className="link font-mono">{p.voucher_no}</Link>}</td>
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
