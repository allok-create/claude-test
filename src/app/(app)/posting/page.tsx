import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getClosingDate, isAutoPostEnabled } from "@/lib/services/settings";
import { listVouchers, VOUCHER_SOURCE_LABELS, VOUCHER_TYPE_LABELS } from "@/lib/services/vouchers";
import { formatMoney } from "@/lib/utils/money";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, PageHeader } from "@/components/ui";
import { postVoucherAction } from "../vouchers/actions";
import { postAllDraftsAction, toggleAutoPostAction } from "./actions";

export const metadata = { title: "自動過帳" };

export default async function PostingPage() {
  const user = await requirePermission("vouchers.post");
  const canSettings = user.permissions.has("admin.settings");
  const autoPost = isAutoPostEnabled();
  const closingDate = getClosingDate();
  const drafts = listVouchers({ status: "draft", limit: 5000 }).sort(
    (a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.id - b.id,
  );
  const draftTotal = drafts.reduce((s, v) => s + v.total_amount, 0);

  return (
    <>
      <PageHeader title="自動過帳" description="設定傳票儲存時是否自動過帳，並可批次或逐張將未過帳傳票過入總帳。" />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card title="自動過帳設定">
          <div className="mb-3 flex items-center gap-2 text-sm">
            目前狀態：{autoPost ? <Badge color="green">已啟用</Badge> : <Badge color="yellow">已停用</Badge>}
          </div>
          <p className="mb-3 text-xs text-slate-500">
            啟用時，具過帳權限者儲存傳票即自動過帳；停用時傳票先存為「未過帳」，待審核後再過帳。
          </p>
          {canSettings ? (
            <ActionForm action={toggleAutoPostAction} className="space-y-2">
              <input type="hidden" name="enable" value={autoPost ? "0" : "1"} />
              <SubmitButton variant={autoPost ? "default" : "primary"}>{autoPost ? "停用自動過帳" : "啟用自動過帳"}</SubmitButton>
            </ActionForm>
          ) : (
            <p className="text-xs text-slate-400">需具「系統設定」權限才能變更此設定。</p>
          )}
        </Card>
        <Card title="關帳日期">
          <div className="mb-2 text-lg font-semibold tabular-nums">{closingDate || "未設定"}</div>
          <p className="mb-3 text-xs text-slate-500">關帳日（含）以前之傳票不得過帳、反過帳或作廢。</p>
          {canSettings && (
            <Link href="/admin/settings" className="link text-sm">
              前往系統設定調整
            </Link>
          )}
        </Card>
        <Card title="批次過帳">
          <ActionForm action={postAllDraftsAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="label">起日（選填）</span>
                <input type="date" name="from" className="input w-full" />
              </label>
              <label>
                <span className="label">迄日（選填）</span>
                <input type="date" name="to" className="input w-full" />
              </label>
            </div>
            <SubmitButton pendingText="過帳中…">批次過帳</SubmitButton>
            <p className="text-xs text-slate-400">未指定期間時，將過帳所有未過帳傳票。</p>
          </ActionForm>
        </Card>
      </div>

      <Card title={`未過帳傳票（${drafts.length} 張）`} bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>傳票號碼</th>
              <th>日期</th>
              <th>類別</th>
              <th>摘要</th>
              <th>來源</th>
              <th className="num">金額</th>
              <th>製單</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {drafts.length === 0 && <EmptyRow colSpan={8} message="目前沒有未過帳傳票" />}
            {drafts.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/vouchers/${v.id}`} className="link font-mono">
                    {v.voucher_no}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  {v.voucher_date}
                  {closingDate && v.voucher_date <= closingDate && (
                    <span className="ml-1">
                      <Badge color="red">已關帳</Badge>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap">{VOUCHER_TYPE_LABELS[v.voucher_type]}</td>
                <td className="max-w-sm truncate">{v.description}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{VOUCHER_SOURCE_LABELS[v.source] ?? v.source}</td>
                <td className="num">{formatMoney(v.total_amount)}</td>
                <td className="whitespace-nowrap text-xs text-slate-500">{v.created_by_name}</td>
                <td className="text-right">
                  <ActionButton action={postVoucherAction} fields={{ id: v.id }} label="過帳" variant="primary" size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
          {drafts.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={5}>合計</td>
                <td className="num">{formatMoney(draftTotal)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </>
  );
}
