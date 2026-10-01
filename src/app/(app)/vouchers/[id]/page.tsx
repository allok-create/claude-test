import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCompanyInfo } from "@/lib/services/settings";
import {
  getVoucher,
  getVoucherLines,
  VOUCHER_SOURCE_LABELS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
} from "@/lib/services/vouchers";
import { formatMoney } from "@/lib/utils/money";
import { toRocDate } from "@/lib/utils/date";
import { ActionButton, PrintButton } from "@/components/forms";
import { Alert, Card, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { deleteVoucherAction, postVoucherAction, unpostVoucherAction, voidVoucherAction } from "../actions";

export const metadata = { title: "傳票明細" };

const SOURCE_LINKS: Record<string, string> = {
  ar_receipt: "/receivables/receipts",
  ap_payment: "/payables/payments",
  inventory: "/inventory/transactions",
};

function userName(id: number | null) {
  if (!id) return "";
  const r = getDb().prepare("SELECT display_name FROM users WHERE id = ?").get(id) as { display_name: string } | undefined;
  return r?.display_name ?? "";
}

export default async function VoucherDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const user = await requirePermission("vouchers.view");
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const v = getVoucher(id);
  if (!v) notFound();
  const lines = getVoucherLines(id);
  const company = getCompanyInfo();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);
  const manual = v.source === "manual";
  const sourceHref = manual
    ? null
    : v.source === "ar_invoice"
      ? `/receivables/${v.source_id}`
      : v.source === "ap_bill"
        ? `/payables/${v.source_id}`
        : SOURCE_LINKS[v.source];

  return (
    <>
      <PageHeader
        title={`傳票 ${v.voucher_no}`}
        actions={
          <>
            <PrintButton />
            {manual && v.status === "draft" && can("vouchers.create") && <LinkButton href={`/vouchers/${v.id}/edit`}>修改</LinkButton>}
            {manual && v.status === "draft" && can("vouchers.create") && (
              <ActionButton action={deleteVoucherAction} fields={{ id: v.id }} label="刪除" confirm="確定刪除此傳票？" />
            )}
            {v.status === "draft" && can("vouchers.post") && <ActionButton action={postVoucherAction} fields={{ id: v.id }} label="過帳" variant="primary" />}
            {manual && v.status === "posted" && can("vouchers.post") && (
              <ActionButton action={unpostVoucherAction} fields={{ id: v.id }} label="反過帳" confirm="反過帳後將自總帳移除此傳票分錄，確定執行？" />
            )}
            {manual && v.status !== "void" && can("vouchers.void") && (
              <ActionButton action={voidVoucherAction} fields={{ id: v.id }} label="作廢" variant="danger" promptReason="請輸入作廢原因" />
            )}
          </>
        }
      />
      {saved && <Alert tone="success">傳票已儲存{v.status === "posted" ? "並完成過帳" : ""}。</Alert>}
      {v.status === "void" && (
        <Alert tone="warn">
          此傳票已於 {v.voided_at} 由 {userName(v.voided_by)} 作廢。原因：{v.void_reason}
        </Alert>
      )}
      {!manual && (
        <Alert>
          本傳票由「{VOUCHER_SOURCE_LABELS[v.source]}」自動產生，如需更正請至原始單據作廢後重新開立。
          {sourceHref && (
            <Link href={sourceHref} className="link ml-2">
              查看原始單據
            </Link>
          )}
        </Alert>
      )}

      <Card bodyClassName="p-6">
        <div className="mb-4 text-center">
          <div className="text-lg font-bold">{company.name}</div>
          <div className="text-xl font-bold tracking-widest">{VOUCHER_TYPE_LABELS[v.voucher_type]}</div>
        </div>
        <div className="mb-4 grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <span className="text-slate-500">傳票號碼：</span>
            <span className="font-mono">{v.voucher_no}</span>
          </div>
          <div>
            <span className="text-slate-500">日期：</span>
            {v.voucher_date}（民國 {toRocDate(v.voucher_date)}）
          </div>
          <div>
            <span className="text-slate-500">狀態：</span>
            <StatusBadge status={v.status} label={VOUCHER_STATUS_LABELS[v.status]} />
          </div>
          <div>
            <span className="text-slate-500">來源：</span>
            {VOUCHER_SOURCE_LABELS[v.source] ?? v.source}
          </div>
          <div className="sm:col-span-4">
            <span className="text-slate-500">摘要：</span>
            {v.description}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>科目代碼</th>
                <th>會計科目</th>
                <th>摘要</th>
                <th>往來對象</th>
                <th className="num">借方金額</th>
                <th className="num">貸方金額</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="text-slate-400">{l.line_no}</td>
                  <td className="font-mono">{l.account_code}</td>
                  <td>{l.account_name}</td>
                  <td>{l.description}</td>
                  <td>{l.partner_name}</td>
                  <td className="num">{formatMoney(l.debit, { blankZero: true })}</td>
                  <td className="num">{formatMoney(l.credit, { blankZero: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="text-right">
                  合計
                </td>
                <td className="num">{formatMoney(v.total_amount)}</td>
                <td className="num">{formatMoney(v.total_amount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-slate-600 sm:grid-cols-4">
          <div>製單：{userName(v.created_by)}</div>
          <div>製單時間：{v.created_at}</div>
          <div>過帳：{userName(v.posted_by)}</div>
          <div>過帳時間：{v.posted_at ?? "—"}</div>
        </div>
      </Card>
    </>
  );
}
