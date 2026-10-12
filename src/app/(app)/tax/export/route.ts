import { getCurrentUser } from "@/lib/auth/session";
import { buildMediaFile } from "@/lib/services/vat";
import { audit } from "@/lib/services/audit";
import { errorMessage } from "@/lib/utils/errors";

/** 下載營業人進、銷項媒體申報檔（{統一編號}.TXT） */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("請先登入", { status: 401 });
  if (!user.permissions.has("tax.view")) return new Response("您沒有執行此操作的權限", { status: 403 });
  const period = new URL(request.url).searchParams.get("period") ?? "";
  if (!/^\d{4}-(01|03|05|07|09|11)$/.test(period)) return new Response("申報期別不正確", { status: 400 });
  try {
    const file = buildMediaFile(period);
    audit(user.id, "export", "vat", period, { records: file.count });
    return new Response(file.content, {
      headers: {
        "Content-Type": "text/plain; charset=us-ascii",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(errorMessage(e), { status: 422, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
