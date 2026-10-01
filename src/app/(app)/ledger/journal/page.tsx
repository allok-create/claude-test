import Link from "next/link";
import { Fragment } from "react";
import { requirePermission } from "@/lib/auth/session";
import { getJournal, type JournalEntry } from "@/lib/services/ledger";
import { getCompanyInfo } from "@/lib/services/settings";
import { VOUCHER_TYPE_LABELS, type VoucherType } from "@/lib/services/vouchers";
import { startOfMonth, today } from "@/lib/utils/date";
import { formatMoney } from "@/lib/utils/money";
import { PrintButton } from "@/components/forms";
import { Badge, Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";
import { periodLabel, resolvePeriod } from "../shared";

export const metadata = { title: "日記簿" };

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requirePermission("ledger.view");
  const sp = await searchParams;
  const { from, to } = resolvePeriod(sp.from, sp.to, startOfMonth(today()), today());
  const entries = getJournal(from, to);
  const company = getCompanyInfo();

  // 依傳票分組
  const groups: { voucherId: number; entries: JournalEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.voucherId === e.voucher_id) last.entries.push(e);
    else groups.push({ voucherId: e.voucher_id, entries: [e] });
  }
  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const balanced = totalDebit === totalCredit;

  return (
    <>
      <PageHeader
        title="日記簿"
        description="依日期及傳票順序列示期間內所有已過帳分錄。"
        actions={<PrintButton />}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 print:hidden">
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
          <ReportTitle company={company.name} title="日記簿" period={periodLabel(from, to)} />
          <table className="table">
            <thead>
              <tr>
                <th>日期</th>
                <th>傳票號碼</th>
                <th>會計科目</th>
                <th>摘要</th>
                <th>往來對象</th>
                <th className="num">借方金額</th>
                <th className="num">貸方金額</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && <EmptyRow colSpan={7} message="期間內無已過帳分錄" />}
              {groups.map((g) => {
                const head = g.entries[0];
                return (
                  <Fragment key={g.voucherId}>
                    {g.entries.map((e, i) => (
                      <tr key={e.id} className={i === 0 ? "border-t-2 border-slate-200" : ""}>
                        <td className="whitespace-nowrap">{i === 0 ? e.entry_date : ""}</td>
                        <td className="whitespace-nowrap">
                          {i === 0 && (
                            <>
                              <Link href={`/vouchers/${e.voucher_id}`} className="link font-mono">
                                {e.voucher_no}
                              </Link>
                              <div className="text-xs text-slate-400">{VOUCHER_TYPE_LABELS[e.voucher_type as VoucherType] ?? ""}</div>
                            </>
                          )}
                        </td>
                        <td className={`whitespace-nowrap ${e.credit > 0 && e.debit === 0 ? "pl-8" : ""}`}>
                          <span className="font-mono text-slate-500">{e.account_code}</span> {e.account_name}
                        </td>
                        <td className="max-w-xs">{e.description ?? head.voucher_description ?? ""}</td>
                        <td className="whitespace-nowrap text-slate-600">{e.partner_name ?? ""}</td>
                        <td className="num">{formatMoney(e.debit, { blankZero: true })}</td>
                        <td className="num">{formatMoney(e.credit, { blankZero: true })}</td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>
                  合計（共 {groups.length} 張傳票、{entries.length} 筆分錄）{" "}
                  {balanced ? <Badge color="green">借貸平衡</Badge> : <Badge color="red">借貸不平衡</Badge>}
                </td>
                <td className="num">{formatMoney(totalDebit)}</td>
                <td className="num">{formatMoney(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
