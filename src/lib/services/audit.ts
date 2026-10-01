import { getDb } from "../db";

export function audit(userId: number | null, action: string, entity: string, entityId?: string | number | null, detail?: unknown) {
  getDb()
    .prepare("INSERT INTO audit_logs (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)")
    .run(userId, action, entity, entityId == null ? null : String(entityId), detail === undefined ? null : JSON.stringify(detail));
}

export type AuditLogRow = {
  id: number;
  user_id: number | null;
  username: string | null;
  display_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: string | null;
  created_at: string;
};

export function listAuditLogs(filter: { from?: string; to?: string; entity?: string; limit?: number } = {}) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    where.push("date(a.created_at) >= ?");
    params.push(filter.from);
  }
  if (filter.to) {
    where.push("date(a.created_at) <= ?");
    params.push(filter.to);
  }
  if (filter.entity) {
    where.push("a.entity = ?");
    params.push(filter.entity);
  }
  return getDb()
    .prepare(
      `SELECT a.*, u.username, u.display_name FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY a.id DESC LIMIT ?`,
    )
    .all(...params, filter.limit ?? 500) as AuditLogRow[];
}
