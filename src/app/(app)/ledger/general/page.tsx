import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { listAccounts } from "@/lib/services/accounts";
import { getGeneralLedger } from "@/lib/services/ledger";
import { getTrialBalance } from "@/lib/services/reports";
import { getCompanyInfo } from "@/lib/services/settings";
import { startOfYear, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";
import { BalanceCells, periodLabel, resolvePeriod } from "../shared";

export const metadata = { title: "總分類帳" };

type Search = { account?: string; from?: string; to?: string };

export default async function GeneralLedgerPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("ledger.view");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.from, sp.to, startOfYear(today()), today());
  const accounts = listAccounts();
  const accountId = Number(sp.account) || 0;
  const ledger = accountId ? getGeneralLedger(accountId, from, to) : null;
  const company = getCompanyInfo();
  const qs = (id: number) => `/ledger/general?account=${id}&from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="總分類帳"
        description="以傳票為單位彙總各科目（含下層科目）之借貸金額及累計餘額。"
        actions={<PrintButton />}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
          <label>
            <span className="label">會計科目</span>
            <select name="account" defaultValue={accountId || ""} className="input w-72">
              <option value="">（全部科目彙總）</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {"　".repeat(a.level - 1)}
                  {a.code} {a.name}
                  {a.is_detail ? "" : "（彙總）"}
                </option>
              ))}
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
          {accountId > 0 && (
            <Link href={`/ledger/general?from=${from}&to=${to}`} className="btn">
              返回彙總
            </Link>
          )}
        </form>
        <div className="p-4">
          {accountId > 0 && !ledger && <Alert tone="error">找不到指定的會計科目。</Alert>}
          {ledger ? (
            <>
              <ReportTitle
                company={company.name}
                title={`總分類帳－${ledger.account.code} ${ledger.account.name}`}
                period={periodLabel(from, to)}
              />
              <table className="table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>傳票號碼</th>
                    <th>摘要</th>
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
                    <BalanceCells balance={ledger.opening} />
                  </tr>
                  {ledger.rows.length === 0 && <EmptyRow colSpan={7} message="期間內無已過帳分錄" />}
                  {ledger.rows.map((r) => (
                    <tr key={r.voucher_id}>
                      <td className="whitespace-nowrap">{r.entry_date}</td>
                      <td className="whitespace-nowrap">
                        <Link href={`/vouchers/${r.voucher_id}`} className="link font-mono">
                          {r.voucher_no}
                        </Link>
                      </td>
                      <td className="max-w-sm">{r.description}</td>
                      <td className="num">{formatMoney(r.debit, { blankZero: true })}</td>
                      <td className="num">{formatMoney(r.credit, { blankZero: true })}</td>
                      <BalanceCells balance={r.balance} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>本期合計</td>
                    <td className="num">{formatMoney(ledger.totalDebit)}</td>
                    <td className="num">{formatMoney(ledger.totalCredit)}</td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr>
                    <td colSpan={3}>期末餘額（{to}）</td>
                    <td></td>
                    <td></td>
                    <BalanceCells balance={ledger.closing} />
                  </tr>
                </tfoot>
              </table>
            </>
          ) : (
            accountId === 0 && <Summary from={from} to={to} company={company.name} link={qs} />
          )}
        </div>
      </Card>
    </>
  );
}

function Summary({ from, to, company, link }: { from: string; to: string; company: string; link: (id: number) => string }) {
  const tb = getTrialBalance(from, to, { maxLevel: 2 });
  return (
    <>
      <ReportTitle company={company} title="總分類帳（科目彙總）" period={periodLabel(from, to)} />
      <table className="table">
        <thead>
          <tr>
            <th>科目代碼</th>
            <th>科目名稱</th>
            <th className="text-center">借/貸</th>
            <th className="num">期初餘額</th>
            <th className="num">本期借方</th>
            <th className="num">本期貸方</th>
            <th className="text-center">借/貸</th>
            <th className="num">期末餘額</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.length === 0 && <EmptyRow colSpan={8} message="期間內無任何科目餘額或發生額" />}
          {tb.rows.map((r) => (
            <tr key={r.account.id} className={r.account.is_detail ? "" : "bg-slate-50/60 font-semibold"}>
              <td className="font-mono">{r.account.code}</td>
              <td style={{ paddingLeft: `${(r.account.level - 1) * 1.25 + 0.75}rem` }}>
                <Link href={link(r.account.id)} className="link">
                  {r.account.name}
                </Link>
              </td>
              <BalanceCells balance={r.opening} />
              <td className="num">{formatMoney(r.debit, { blankZero: true })}</td>
              <td className="num">{formatMoney(r.credit, { blankZero: true })}</td>
              <BalanceCells balance={r.closing} />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>
              本期發生額合計（明細科目）{" "}
              {tb.totals.debit === tb.totals.credit ? <Badge color="green">借貸平衡</Badge> : <Badge color="red">借貸不平衡</Badge>}
            </td>
            <td className="num">{formatMoney(tb.totals.debit)}</td>
            <td className="num">{formatMoney(tb.totals.credit)}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </>
  );
}
