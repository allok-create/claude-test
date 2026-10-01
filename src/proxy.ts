import { NextResponse, type NextRequest } from "next/server";

/**
 * 樂觀式登入檢查：沒有 session cookie 時導向登入頁。
 * 實際的身分與權限驗證於伺服器端（requireUser / requirePermission）執行。
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("acct_session");
  const { pathname } = request.nextUrl;
  if (!hasSession && pathname !== "/login") {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|ico)$).*)"],
};
