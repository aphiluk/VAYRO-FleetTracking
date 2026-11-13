import { sql } from "./db";

interface AuditEvent {
  companyId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: object;
  newValue?: object;
  result?: "success" | "failure";
  ip?: string | null;
}

// Auth audit is best effort; pass a transaction to make user changes and audit atomic. Never pass secrets.
export async function audit(e: AuditEvent, db = sql) {
  try {
    await db`
      INSERT INTO system_log (company_id, user_id, action, entity_type, entity_id, old_value, new_value, result, ip_address)
      VALUES (${e.companyId ?? null}, ${e.userId ?? null}, ${e.action}, ${e.entityType ?? null}, ${e.entityId ?? null},
        ${e.oldValue ?? null}::jsonb, ${e.newValue ?? null}::jsonb,
        ${e.result ?? "success"}, ${e.ip ?? null})`;
  } catch (err) {
    if (db !== sql) throw err; // Transactional user changes must roll back if their audit write fails.
    console.error("audit write failed:", err instanceof Error ? err.message : "unknown error");
  }
}
