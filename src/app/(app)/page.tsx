import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/lib/services/dashboard";
import { VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS, type VoucherStatus, type VoucherType } from "@/lib/services/vouchers";
import { formatMoney, formatQty } from "@/lib/utils/money";
import { Card, EmptyRow, Money, PageHeader, StatCard, StatusBadge } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireUser();
  const d = getDashboard();
  const can = (p: Parameters<typeof user.permissions.has>[0]) => user.permissions.has(p);

  return (
    <>
      <PageHeader title="儀表板" description={`今日 ${d.today}，歡迎 ${user.displayName}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="現金及銀行存款" value={formatMoney(d.cash)} href={can("ledger.view") ? "/ledger/general" : undefined} />
        <StatCard
          label="應收帳款餘額"
          value={formatMoney(d.ar.outstanding)}
          hint={`${d.ar.count} 張未結清，逾期 ${formatMoney(d.ar.overdue)}`}
          tone={d.ar.overdue > 0 ? "warn" : "default"}
          href={can("ar.view") ? "/receivables/aging" : undefined}
        />
        <StatCard
          label="應付帳款餘額"
          value={formatMoney(d.ap.outstanding)}
          hint={`${d.ap.count} 張未結清，逾期 ${formatMoney(d.ap.overdue)}`}
          tone={d.ap.overdue > 0 ? "warn" : "default"}
          href={can("ap.view") ? "/payables/aging" : undefined}
        />
        <StatCard
          label="未過帳傳票"
          value={d.vouchers.draft ?? 0}
          hint={`已過帳 ${d.vouchers.posted ?? 0} 張`}
          tone={(d.vouchers.draft ?? 0) > 0 ? "warn" : "default"}
          href={can("vouchers.post") ? "/posting" : undefined}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="本月收益" value={formatMoney(d.month.revenue)} />
        <StatCard label="本月費損" value={formatMoney(d.month.expense)} />
        <StatCard
          label="本月損益"
          value={<Money value={d.month.net} />}
          hint={<>本年度累計：{formatMoney(d.ytdNetIncome)}</>}
          href={can("reports.view") ? "/reports/income-statement" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card
          title="最近傳票"
          className="xl:col-span-2"
          bodyClassName="overflow-x-auto"
          actions={can("vouchers.create") && <Link href="/vouchers/new" className="btn btn-primary btn-sm">新增傳票</Link>}
        >
          <table className="table">
            <thead>
              <tr>
                <th>傳票號碼</th>
                <th>日期</th>
                <th>類別</th>
                <th>摘要</th>
                <th className="num">金額</th>
                <th>狀態</th>
              </tr>
            </thead>
            <tbody>
              {d.recentVouchers.length === 0 && <EmptyRow colSpan={6} message="尚無傳票" />}
              {d.recentVouchers.map((v) => (
                <tr key={v.id}>
                  <td>
                    {can("vouchers.view") ? <Link className="link" href={`/vouchers/${v.id}`}>{v.voucher_no}</Link> : v.voucher_no}
                  </td>
                  <td className="whitespace-nowrap">{v.voucher_date}</td>
                  <td className="whitespace-nowrap">{VOUCHER_TYPE_LABELS[v.voucher_type as VoucherType]}</td>
                  <td className="max-w-xs truncate">{v.description}</td>
                  <td className="num">{formatMoney(v.total_amount)}</td>
                  <td>
                    <StatusBadge status={v.status} label={VOUCHER_STATUS_LABELS[v.status as VoucherStatus]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="低於安全存量" bodyClassName="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>商品</th>
                <th className="num">現有</th>
                <th className="num">安全存量</th>
              </tr>
            </thead>
            <tbody>
              {d.lowStock.length === 0 && <EmptyRow colSpan={3} message="庫存皆正常" />}
              {d.lowStock.map((p) => (
                <tr key={p.id}>
                  <td>
                    {can("inventory.view") ? <Link className="link" href={`/inventory/products/${p.id}`}>{p.sku} {p.name}</Link> : `${p.sku} ${p.name}`}
                  </td>
                  <td className="num text-rose-600">{formatQty(p.quantity_on_hand)} {p.unit}</td>
                  <td className="num">{formatQty(p.safety_stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
