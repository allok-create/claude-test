import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { ACCOUNT_TYPE_LABELS, categoryLabel, listAccounts } from "@/lib/services/accounts";
import { Badge, Card, LinkButton, PageHeader } from "@/components/ui";

export const metadata = { title: "科目表管理" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  const user = await requirePermission("accounts.view");
  const { q = "", type = "" } = await searchParams;
  const canManage = user.permissions.has("accounts.manage");
  const accounts = listAccounts().filter(
    (a) => (!type || a.type === type) && (!q || a.code.includes(q) || a.name.includes(q)),
  );

  return (
    <>
      <PageHeader
        title="科目表管理"
        description="會計科目採階層式管理；僅末層「明細科目」可輸入傳票，上層科目於報表中自動彙總。"
        actions={canManage && <LinkButton href="/accounts/new" variant="primary">新增科目</LinkButton>}
      />
      <Card bodyClassName="overflow-x-auto">
        <form className="flex flex-wrap gap-2 border-b border-slate-200 p-3 print:hidden">
          <input name="q" defaultValue={q} placeholder="搜尋代碼或名稱" className="input w-48" />
          <select name="type" defaultValue={type} className="input w-32">
            <option value="">全部類別</option>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn">查詢</button>
        </form>
        <table className="table">
          <thead>
            <tr>
              <th>科目代碼</th>
              <th>科目名稱</th>
              <th>類別</th>
              <th>報表分類</th>
              <th>餘額方向</th>
              <th>性質</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.is_detail ? "" : "bg-slate-50/60 font-medium"}>
                <td className="font-mono">{a.code}</td>
                <td style={{ paddingLeft: `${(a.level - 1) * 1.25 + 0.75}rem` }}>
                  {canManage ? (
                    <Link href={`/accounts/${a.id}`} className="link">
                      {a.name}
                    </Link>
                  ) : (
                    a.name
                  )}
                </td>
                <td>{ACCOUNT_TYPE_LABELS[a.type]}</td>
                <td className="text-slate-500">{categoryLabel(a.category)}</td>
                <td>{a.normal_balance === "debit" ? "借" : "貸"}</td>
                <td>{a.is_detail ? <Badge color="blue">明細</Badge> : <Badge>彙總</Badge>}</td>
                <td>{a.is_active ? <Badge color="green">啟用</Badge> : <Badge color="red">停用</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
