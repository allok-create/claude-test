import { requirePermission } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/services/audit";
import { addDays, today } from "@/lib/utils/date";
import { Card, EmptyRow, PageHeader } from "@/components/ui";

export const metadata = { title: "稽核紀錄" };

const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  update: "修改",
  delete: "刪除",
  post: "過帳",
  unpost: "反過帳",
  void: "作廢",
  login: "登入",
  login_failed: "登入失敗",
  adjust: "庫存調整",
  change_password: "變更密碼",
};

const ENTITY_LABELS: Record<string, string> = {
  voucher: "傳票",
  account: "科目",
  customer: "客戶",
  vendor: "供應商",
  ar_invoice: "應收單",
  ar_receipt: "收款單",
  ap_bill: "應付單",
  ap_payment: "付款單",
  product: "商品",
  inventory: "庫存",
  user: "使用者",
  role: "角色",
  settings: "系統設定",
  auth: "登入",
};

function formatDetail(detail: string | null): string {
  if (!detail) return "";
  let text = detail;
  try {
    text = JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    // 非 JSON 原樣顯示
  }
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

type Search = { from?: string; to?: string; entity?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePermission("admin.audit");
  const sp = await searchParams;
  const from = sp.from ?? addDays(today(), -30);
  const to = sp.to ?? today();
  const entity = sp.entity ?? "";
  const logs = listAuditLogs({ from: from || undefined, to: to || undefined, entity: entity || undefined });

  return (
    <>
      <PageHeader title="稽核紀錄" description="系統記錄所有新增、修改、刪除、過帳、作廢及登入等操作（最近 500 筆）。" />
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
          <label>
            <span className="label">對象</span>
            <select name="entity" defaultValue={entity} className="input">
              <option value="">全部</option>
              {Object.entries(ENTITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>時間</th>
              <th>使用者</th>
              <th>動作</th>
              <th>對象</th>
              <th>對象編號</th>
              <th>內容</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <EmptyRow colSpan={6} />}
            {logs.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="whitespace-nowrap font-mono text-xs">{l.created_at}</td>
                <td className="whitespace-nowrap">
                  {l.display_name ?? <span className="text-slate-400">—</span>}
                  {l.username && <span className="ml-1 text-xs text-slate-400">{l.username}</span>}
                </td>
                <td className={`whitespace-nowrap ${l.action === "login_failed" || l.action === "delete" || l.action === "void" ? "text-rose-600" : ""}`}>
                  {ACTION_LABELS[l.action] ?? l.action}
                </td>
                <td className="whitespace-nowrap">{ENTITY_LABELS[l.entity] ?? l.entity}</td>
                <td className="font-mono text-xs">{l.entity_id}</td>
                <td>
                  {l.detail && (
                    <pre className="max-h-40 max-w-xl overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-1.5 text-xs text-slate-600">
                      {formatDetail(l.detail)}
                    </pre>
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
