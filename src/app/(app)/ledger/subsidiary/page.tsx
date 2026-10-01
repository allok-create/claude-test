import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listPostableAccounts } from "@/lib/services/accounts";
import { getSubsidiaryLedger } from "@/lib/services/ledger";
import { listPartners } from "@/lib/services/partners";
import { getCompanyInfo } from "@/lib/services/settings";
import { startOfYear, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Alert, Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";
import { BalanceCells, periodLabel, resolvePeriod } from "../shared";

export const metadata = { title: "明細分類帳" };

type Search = { account?: string; partner?: string; from?: string; to?: string };

export default async function SubsidiaryLedgerPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("ledger.view");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.from, sp.to, startOfYear(today()), today());
  const accounts = listPostableAccounts();
  const customers = listPartners("customer");
  const vendors = listPartners("vendor");
  const accountId = Number(sp.account) || 0;

  const [pt, pidRaw] = (sp.partner ?? "").split(":");
  const partnerType = pt === "customer" || pt === "vendor" ? pt : undefined;
  const partnerId = partnerType ? Number(pidRaw) || undefined : undefined;
  const partnerValue = partnerType && partnerId ? `${partnerType}:${partnerId}` : "";
  const partnerName = partnerType && partnerId
    ? (partnerType === "customer" ? customers : vendors).find((p) => p.id === partnerId)?.name
    : undefined;

  const ledger = accountId ? getSubsidiaryLedger(accountId, from, to, { partnerType, partnerId }) : null;
  const company = getCompanyInfo();

  return (
    <>
      <PageHeader
        title="明細分類帳"
        description="逐筆列示明細科目之已過帳分錄及累計餘額，可依客戶或供應商篩選。"
        actions={<PrintButton />}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">會計科目</span>
            <select name="account" defaultValue={accountId || ""} className="input w-64" required>
              <option value="">請選擇明細科目</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">往來對象</span>
            <select name="partner" defaultValue={partnerValue} className="input w-52">
              <option value="">全部</option>
              {customers.length > 0 && (
                <optgroup label="客戶">
                  {customers.map((c) => (
                    <option key={`c${c.id}`} value={`customer:${c.id}`}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {vendors.length > 0 && (
                <optgroup label="供應商">
                  {vendors.map((v) => (
                    <option key={`v${v.id}`} value={`vendor:${v.id}`}>
                      {v.code} {v.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label>
            <span className="label">起日</span>
            <input type="date" name="from" defaultValue={from} className="input" />
          </label>
          <label>
            <span className="label">迄日</span>
            <input type="date" name="to" defaultValue={to} className="input" />
          </label>
          <button className="btn">查詢</button>
        </form>
        <div className="p-4">
          {!accountId && <p className="py-10 text-center text-sm text-slate-400">請選擇會計科目後查詢。</p>}
          {accountId > 0 && !ledger && <Alert tone="error">找不到指定的會計科目。</Alert>}
          {ledger && (
            <>
              <ReportTitle
                company={company.name}
                title={`明細分類帳－${ledger.account.code} ${ledger.account.name}${partnerName ? `（${partnerName}）` : ""}`}
                period={periodLabel(from, to)}
              />
              <table className="table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>傳票號碼</th>
                    <th>摘要</th>
                    <th>往來對象</th>
                    <th className="num">借方金額</th>
                    <th className="num">貸方金額</th>
                    <th className="text-center">借/貸</th>
                    <th className="num">餘額</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-slate-50/60 font-medium">
                    <td className="whitespace-nowrap">{from}</td>
                    <td></td>
                    <td>期初餘額</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <BalanceCells balance={ledger.opening} />
                  </tr>
                  {ledger.rows.length === 0 && <EmptyRow colSpan={8} message="期間內無已過帳分錄" />}
                  {ledger.rows.map((r, i) => (
                    <tr key={`${r.voucher_id}-${i}`}>
                      <td className="whitespace-nowrap">{r.entry_date}</td>
                      <td className="whitespace-nowrap">
                        <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">
                          {r.voucher_no}
                        </Link>
                      </td>
                      <td className="max-w-sm">{r.description}</td>
                      <td className="whitespace-nowrap text-slate-600">{r.partner_name ?? ""}</td>
                      <td className="num">{formatMoney(r.debit, { blankZero: true })}</td>
                      <td className="num">{formatMoney(r.credit, { blankZero: true })}</td>
                      <BalanceCells balance={r.balance} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>本期合計（{ledger.rows.length} 筆）</td>
                    <td className="num">{formatMoney(ledger.totalDebit)}</td>
                    <td className="num">{formatMoney(ledger.totalCredit)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={6}>期末餘額（{to}）</td>
                    <BalanceCells balance={ledger.closing} />
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
