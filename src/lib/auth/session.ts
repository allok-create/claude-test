import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import type { Permission } from "./permissions";
import { getRolePermissions } from "../services/users";
import { AppError } from "../utils/errors";

export const SESSION_COOKIE = "acct_session";

export type CurrentUser = {
  id: number;
  username: string;
  displayName: string;
  roleId: number;
  roleName: string;
  permissions: Set<Permission>;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function ttlHours() {
  return Number(process.env.SESSION_TTL_HOURS) || 12;
}

/** 建立登入工作階段並寫入 httpOnly cookie */
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + ttlHours() * 3600 * 1000);
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(token), userId, expires.toISOString());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIE !== "1",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) getDb().prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  store.delete(SESSION_COOKIE);
}

/** 取得目前登入者（同一請求內快取） */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role_id, r.name role_name, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id
       WHERE s.id = ? AND u.is_active = 1`,
    )
    .get(hashToken(token)) as
    | { id: number; username: string; display_name: string; role_id: number; role_name: string; expires_at: string }
    | undefined;
  if (!row || row.expires_at < new Date().toISOString()) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    roleId: row.role_id,
    roleName: row.role_name,
    permissions: new Set(getRolePermissions(row.role_id)),
  };
});

/** 頁面／動作使用：未登入導向登入頁 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 頁面使用：無權限時導向無權限頁 */
export async function requirePermission(...perms: Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!perms.every((p) => user.permissions.has(p))) redirect("/forbidden");
  return user;
}

export function can(user: CurrentUser, perm: Permission) {
  return user.permissions.has(perm);
}

/** Server Action 使用：無權限時拋出可顯示的錯誤 */
export async function authorize(...perms: Permission[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!perms.every((p) => user.permissions.has(p))) {
    throw new AppError("您沒有執行此操作的權限");
  }
  return user;
}
