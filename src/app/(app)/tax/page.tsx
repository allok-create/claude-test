import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import {
  collectVatRecords,
  computeVat401,
  getFilerInfo,
  getFiling,
  getLedgerVat,
  listFilings,
  vatPeriodRange,
  type Vat401,
  type VatProblem,
} from "@/lib/services/vat";
import { getCompanyInfo } from "@/lib/services/settings";
import { formatMoney } from "@/lib/utils/money";
import { ActionButton, PrintButton } from "@/components/forms";
import { Alert, Badge, Card, EmptyRow, PageHeader, ReportTitle } from "@/components/ui";
import { fileVatAction, unfileVatAction } from "./actions";
import { recentPeriods, validPeriod } from "./period";

export const metadata = { title: "營業稅申報（401）" };

const PROBLEM_LINKS: Record<VatProblem["source"], (id: number) => string> = {
  ar_invoice: (id) => `/receivables/${id}`,
  ap_bill: (id) => `/payables/${id}`,
  ar_allowance: () => "/receivables/allowances",
  ap_allowance: () => "/payables/allowances",
};

const M = ({ v }: { v: number }) => <span className="tabular-nums">{formatMoney(v)}</span>;

export default async function TaxPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await requirePermission("tax.view");
  const period = validPeriod((await searchParams).period);
  const { from, to } = vatPeriodRange(period);
  const filing = getFiling(period);
  const filer = getFilerInfo();
  const { records, problems } = collectVatRecords(period);
  const r: Vat401 = filing ? (JSON.parse(filing.data) as Vat401) : computeVat401(period, records);
  const ledger = getLedgerVat(period);
  const filings = listFilings();
  const latestFiled = filings[0]?.period;
  const company = getCompanyInfo();
  const canFile = user.permissions.has("tax.file");
  const ready = filer.errors.length === 0 && problems.length === 0;
  const s = r.sales;
  const p = r.purchases;

  return (
    <>
      <PageHeader
        title="營業稅申報（401）"
        description="依進銷項憑證計算 401 申報書，並產生營業人進、銷項媒體申報檔，供上傳至財政部營業稅網路申報系統。"
        actions={
          <>
            <PrintButton />
            <Link href={`/tax/records?period=${period}`} className="btn">
              檢視媒體資料
            </Link>
            {ready ? (
              <a href={`/tax/export?period=${period}`} className="btn btn-primary" download>
                下載媒體申報檔
              </a>
            ) : (
              <span className="btn cursor-not-allowed opacity-50" title="資料不完整，請先修正">
                下載媒體申報檔
              </span>
            )}
          </>
        }
      />

      <Card bodyClassName="p-3" className="mb-4 print:hidden">
        <form className="flex flex-wrap items-end gap-2">
          <label>
            <span className="label">申報期別</span>
            <select name="period" defaultValue={period} className="input">
              {recentPeriods().map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">查詢</button>
          <span className="ml-2 text-sm text-slate-500">
            {from} ～ {to}
          </span>
          <span className="ml-auto">{filing ? <Badge color="green">已申報（{filing.filed_at}）</Badge> : <Badge color="yellow">未申報</Badge>}</span>
        </form>
      </Card>

      {filer.errors.length > 0 && (
        <Alert tone="error">
          {filer.errors.join("；")}。
          {user.permissions.has("admin.settings") && (
            <Link href="/admin/settings" className="link ml-2">
              前往系統設定
            </Link>
          )}
        </Alert>
      )}
      {problems.length > 0 && (
        <Alert tone="error">
          <div className="font-semibold">下列 {problems.length} 筆憑證資料不完整，修正後才能匯出媒體檔或確認申報：</div>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((x) => (
              <li key={`${x.source}${x.sourceId}`}>
                <Link href={PROBLEM_LINKS[x.source](x.sourceId)} className="link font-mono">
                  {x.sourceNo}
                </Link>{" "}
                {x.partnerName}：{x.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {r.warnings.map((w) => (
        <Alert key={w} tone="warn">
          {w}
        </Alert>
      ))}

      <Card bodyClassName="p-6 overflow-x-auto">
        <ReportTitle company={company.name} title="營業人銷售額與稅額申報書（401）試算" period={r.label} />
        <div className="mb-4 text-center text-xs text-slate-500">
          統一編號 {filer.taxId || "—"}｜稅籍編號 {filer.taxRegNo || "—"}
        </div>

        <h3 className="mb-2 font-semibold">一、銷項</h3>
        <table className="table mb-6">
          <thead>
            <tr>
              <th>項目</th>
              <th className="num">應稅銷售額</th>
              <th className="num">稅額</th>
              <th className="num">零稅率銷售額</th>
              <th className="num">免稅銷售額</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((row) => (
              <tr key={row.code}>
                <td>
                  <span className="mr-2 font-mono text-xs text-slate-400">{row.code}</span>
                  {row.label}
                </td>
                <td className="num"><M v={row.taxable.amount} /></td>
                <td className="num"><M v={row.taxable.tax} /></td>
                <td className="num"><M v={row.zeroRated} /></td>
                <td className="num"><M v={row.exempt} /></td>
              </tr>
            ))}
            <tr>
              <td>
                <span className="mr-2 font-mono text-xs text-slate-400">33/34</span>減：退回及折讓
              </td>
              <td className="num"><M v={-s.allowance.taxable.amount} /></td>
              <td className="num"><M v={-s.allowance.taxable.tax} /></td>
              <td className="num"><M v={-s.allowance.zeroRated} /></td>
              <td className="num"><M v={-s.allowance.exempt} /></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td className="num"><M v={s.total.taxable.amount} /></td>
              <td className="num"><M v={s.total.taxable.tax} /></td>
              <td className="num"><M v={s.total.zeroRated} /></td>
              <td className="num"><M v={s.total.exempt} /></td>
            </tr>
          </tfoot>
        </table>
        <p className="-mt-4 mb-6 text-xs text-slate-500">
          零稅率銷售額：經海關出口 {formatMoney(s.zeroRatedCustoms)}；非經海關出口 {formatMoney(s.zeroRatedNonCustoms)}
        </p>

        <h3 className="mb-2 font-semibold">二、得扣抵進項</h3>
        <table className="table mb-6">
          <thead>
            <tr>
              <th>項目</th>
              <th className="num">進貨及費用金額</th>
              <th className="num">進貨及費用稅額</th>
              <th className="num">固定資產金額</th>
              <th className="num">固定資產稅額</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((row) => (
              <tr key={row.code}>
                <td>
                  <span className="mr-2 font-mono text-xs text-slate-400">{row.code}</span>
                  {row.label}
                </td>
                <td className="num"><M v={row.expense.amount} /></td>
                <td className="num"><M v={row.expense.tax} /></td>
                <td className="num"><M v={row.fixedAsset.amount} /></td>
                <td className="num"><M v={row.fixedAsset.tax} /></td>
              </tr>
            ))}
            <tr>
              <td>
                <span className="mr-2 font-mono text-xs text-slate-400">23/24</span>減：退出及折讓
              </td>
              <td className="num"><M v={-p.allowance.expense.amount} /></td>
              <td className="num"><M v={-p.allowance.expense.tax} /></td>
              <td className="num"><M v={-p.allowance.fixedAsset.amount} /></td>
              <td className="num"><M v={-p.allowance.fixedAsset.tax} /></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td className="num"><M v={p.total.expense.amount} /></td>
              <td className="num"><M v={p.total.expense.tax} /></td>
              <td className="num"><M v={p.total.fixedAsset.amount} /></td>
              <td className="num"><M v={p.total.fixedAsset.tax} /></td>
            </tr>
          </tfoot>
        </table>
        <p className="-mt-4 mb-6 text-xs text-slate-500">
          不得扣抵進項（扣抵代號 3、4，已併入成本費用，不列入計算）：金額 {formatMoney(p.nonDeductible.amount)}、稅額 {formatMoney(p.nonDeductible.tax)}
        </p>

        <h3 className="mb-2 font-semibold">三、稅額計算</h3>
        <table className="table max-w-xl">
          <tbody>
            <tr>
              <td>本期銷項稅額合計</td>
              <td className="num"><M v={r.outputTax} /></td>
            </tr>
            <tr>
              <td>得扣抵進項稅額合計</td>
              <td className="num"><M v={r.inputTax} /></td>
            </tr>
            <tr>
              <td>
                上期（月）累積留抵稅額
                <div className="text-xs text-slate-400">{r.carryInSource}</div>
              </td>
              <td className="num"><M v={r.carryIn} /></td>
            </tr>
            <tr className="font-semibold">
              <td>本期應實繳稅額</td>
              <td className="num"><M v={r.payable} /></td>
            </tr>
            <tr>
              <td>本期溢付稅額</td>
              <td className="num"><M v={r.excess} /></td>
            </tr>
            <tr>
              <td>
                退稅限額
                <div className="text-xs text-slate-400">零稅率銷售額 × 5% ＋ 得扣抵固定資產進項稅額</div>
              </td>
              <td className="num"><M v={r.refundLimit} /></td>
            </tr>
            <tr className="font-semibold">
              <td>本期應退稅額</td>
              <td className="num"><M v={r.refund} /></td>
            </tr>
            <tr className="font-semibold">
              <td>本期累積留抵稅額</td>
              <td className="num"><M v={r.carryOut} /></td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="帳載核對" className="mt-4 print:hidden" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>項目</th>
              <th className="num">憑證彙總</th>
              <th className="num">帳列發生額（不含結轉傳票）</th>
              <th className="num">差異</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: "銷項稅額", doc: r.outputTax, gl: ledger.outputTax },
              { label: "進項稅額（得扣抵）", doc: r.inputTax, gl: ledger.inputTax },
            ].map((x) => (
              <tr key={x.label}>
                <td>{x.label}</td>
                <td className="num"><M v={x.doc} /></td>
                <td className="num"><M v={x.gl} /></td>
                <td className={`num ${x.doc !== x.gl ? "font-semibold text-rose-600" : "text-emerald-600"}`}>
                  {x.doc === x.gl ? "相符" : formatMoney(x.gl - x.doc)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-3 text-xs text-slate-500">
          差異通常來自以手動傳票直接記入銷項／進項稅額科目而未建立應收／應付單據；媒體申報檔僅包含應收、應付單據及折讓單。
        </p>
      </Card>

      {canFile && (
        <Card title="申報作業" className="mt-4 print:hidden">
          {filing ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                已於 {filing.filed_at} 確認申報
                {filing.voucher_id && (
                  <>
                    ，結轉傳票{" "}
                    <Link href={`/vouchers/${filing.voucher_id}`} className="link">
                      查看
                    </Link>
                  </>
                )}
                。本期發票與折讓單已鎖定。
              </span>
              {latestFiled === period && (
                <ActionButton action={unfileVatAction} fields={{ period }} label="取消申報" variant="danger" confirm="取消申報將作廢營業稅結轉傳票並解除本期憑證鎖定，確定執行？" />
              )}
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-slate-600">
                請先下載媒體申報檔，於財政部營業稅網路申報系統完成申報後，再按「確認申報」。確認後系統將產生營業稅結轉傳票（銷項稅額、進項稅額轉入應付營業稅、應收退稅款或留抵稅額），並鎖定本期發票與折讓單。
              </p>
              <ActionButton
                action={fileVatAction}
                fields={{ period }}
                label="確認申報"
                variant="primary"
                confirm={`確認${r.label}營業稅已完成申報？`}
              />
              {!ready && <p className="text-xs text-rose-600">資料尚不完整，確認申報時將被拒絕。</p>}
            </div>
          )}
        </Card>
      )}

      <Card title="申報紀錄" className="mt-4 print:hidden" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>期別</th>
              <th className="num">銷項稅額</th>
              <th className="num">進項稅額</th>
              <th className="num">上期留抵</th>
              <th className="num">應實繳</th>
              <th className="num">應退稅</th>
              <th className="num">累積留抵</th>
              <th>結轉傳票</th>
              <th>申報人</th>
            </tr>
          </thead>
          <tbody>
            {filings.length === 0 && <EmptyRow colSpan={9} message="尚無申報紀錄" />}
            {filings.map((f) => (
              <tr key={f.period}>
                <td>
                  <Link href={`/tax?period=${f.period}`} className="link">
                    {(JSON.parse(f.data) as Vat401).label}
                  </Link>
                </td>
                <td className="num"><M v={f.output_tax} /></td>
                <td className="num"><M v={f.input_tax} /></td>
                <td className="num"><M v={f.carry_in} /></td>
                <td className="num"><M v={f.payable} /></td>
                <td className="num"><M v={f.refund} /></td>
                <td className="num"><M v={f.carry_out} /></td>
                <td>
                  {f.voucher_id && (
                    <Link href={`/vouchers/${f.voucher_id}`} className="link font-mono">
                      {f.voucher_no}
                    </Link>
                  )}
                </td>
                <td className="text-xs text-slate-500">
                  {f.filed_by_name}
                  <div>{f.filed_at}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
