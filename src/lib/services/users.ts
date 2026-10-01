import { getDb, tx } from "../db";
import { hashPassword, verifyPassword } from "../auth/password";
import { isPermission, type Permission } from "../auth/permissions";
import { AppError, assert } from "../utils/errors";
import { audit } from "./audit";

/** 使用者與角色權限管理 */

export type Role = { id: number; code: string; name: string; description: string | null; is_system: number; user_count?: number };

export type UserRow = {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role_id: number;
  role_name: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
};

export function listRoles(): Role[] {
  return getDb()
    .prepare("SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) user_count FROM roles r ORDER BY r.id")
    .all() as Role[];
}

export function getRole(id: number): Role | undefined {
  return getDb().prepare("SELECT * FROM roles WHERE id = ?").get(id) as Role | undefined;
}

export function getRolePermissions(roleId: number): Permission[] {
  return (getDb().prepare("SELECT permission FROM role_permissions WHERE role_id = ?").all(roleId) as { permission: string }[])
    .map((r) => r.permission)
    .filter(isPermission);
}

export function saveRole(input: { id?: number; code: string; name: string; description?: string; permissions: string[] }, userId: number): number {
  assert(/^[a-z0-9_]{2,30}$/.test(input.code), "角色代碼須為 2–30 碼小寫英數字或底線");
  assert(input.name.trim(), "請輸入角色名稱");
  const perms = input.permissions.filter(isPermission);
  return tx((db) => {
    let id = input.id;
    if (id) {
      const role = getRole(id);
      assert(role, "角色不存在");
      if (role.code === "admin") {
        // 避免系統管理員角色被移除權限而無法管理系統
        assert(perms.includes("admin.roles") && perms.includes("admin.users"), "系統管理員角色必須保留使用者及角色管理權限");
      }
      db.prepare("UPDATE roles SET name = ?, description = ?, code = CASE WHEN is_system = 1 THEN code ELSE ? END WHERE id = ?").run(
        input.name.trim(),
        input.description || null,
        input.code,
        id,
      );
      db.prepare("DELETE FROM role_permissions WHERE role_id = ?").run(id);
    } else {
      const { lastInsertRowid } = db
        .prepare("INSERT INTO roles (code, name, description) VALUES (?, ?, ?)")
        .run(input.code, input.name.trim(), input.description || null);
      id = Number(lastInsertRowid);
    }
    const ins = db.prepare("INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)");
    for (const p of perms) ins.run(id, p);
    audit(userId, input.id ? "update" : "create", "role", id, { name: input.name, permissions: perms });
    return id;
  });
}

export function deleteRole(id: number, userId: number) {
  const role = getRole(id);
  assert(role, "角色不存在");
  assert(!role.is_system, "系統預設角色不可刪除");
  const used = getDb().prepare("SELECT 1 FROM users WHERE role_id = ? LIMIT 1").get(id);
  if (used) throw new AppError("仍有使用者屬於此角色，無法刪除");
  getDb().prepare("DELETE FROM roles WHERE id = ?").run(id);
  audit(userId, "delete", "role", id, { name: role.name });
}

export function listUsers(): UserRow[] {
  return getDb()
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.email, u.role_id, r.name role_name, u.is_active, u.last_login_at, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id`,
    )
    .all() as UserRow[];
}

export function getUser(id: number): UserRow | undefined {
  return listUsers().find((u) => u.id === id);
}

function validatePassword(pw: string) {
  assert(pw.length >= 8, "密碼長度至少 8 碼");
  assert(/[A-Za-z]/.test(pw) && /\d/.test(pw), "密碼須同時包含英文字母與數字");
}

export function createUser(
  input: { username: string; displayName: string; email?: string; roleId: number; password: string; isActive: boolean },
  actorId: number,
): number {
  assert(/^[A-Za-z0-9_.-]{3,30}$/.test(input.username), "帳號須為 3–30 碼英數字");
  assert(input.displayName.trim(), "請輸入姓名");
  assert(getRole(input.roleId), "請選擇角色");
  validatePassword(input.password);
  const { lastInsertRowid } = getDb()
    .prepare("INSERT INTO users (username, display_name, email, password_hash, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.username, input.displayName.trim(), input.email || null, hashPassword(input.password), input.roleId, input.isActive ? 1 : 0);
  audit(actorId, "create", "user", Number(lastInsertRowid), { username: input.username });
  return Number(lastInsertRowid);
}

export function updateUser(
  id: number,
  input: { displayName: string; email?: string; roleId: number; isActive: boolean; password?: string },
  actorId: number,
) {
  const user = getUser(id);
  assert(user, "使用者不存在");
  assert(input.displayName.trim(), "請輸入姓名");
  assert(getRole(input.roleId), "請選擇角色");
  if (id === actorId) {
    assert(input.isActive, "不可停用自己的帳號");
    assert(input.roleId === user.role_id, "不可變更自己的角色");
  }
  tx((db) => {
    db.prepare("UPDATE users SET display_name = ?, email = ?, role_id = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ?").run(
      input.displayName.trim(),
      input.email || null,
      input.roleId,
      input.isActive ? 1 : 0,
      id,
    );
    if (input.password) {
      validatePassword(input.password);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(input.password), id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    }
    if (!input.isActive) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
    audit(actorId, "update", "user", id, { displayName: input.displayName, roleId: input.roleId, isActive: input.isActive, passwordReset: !!input.password });
  });
}

export function changeOwnPassword(userId: number, current: string, next: string) {
  const row = getDb().prepare("SELECT password_hash FROM users WHERE id = ?").get(userId) as { password_hash: string } | undefined;
  assert(row, "使用者不存在");
  assert(verifyPassword(current, row.password_hash), "目前密碼不正確");
  validatePassword(next);
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(next), userId);
  audit(userId, "change_password", "user", userId);
}

/** 驗證帳密，成功時回傳使用者 ID */
export function authenticate(username: string, password: string): number | null {
  const row = getDb().prepare("SELECT id, password_hash, is_active FROM users WHERE username = ?").get(username) as
    | { id: number; password_hash: string; is_active: number }
    | undefined;
  if (!row || !row.is_active || !verifyPassword(password, row.password_hash)) {
    audit(row?.id ?? null, "login_failed", "auth", null, { username });
    return null;
  }
  getDb().prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(row.id);
  audit(row.id, "login", "auth", row.id);
  return row.id;
}
