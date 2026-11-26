import "server-only";
import { db, fetchAll } from "./supabase";

export const BACKUP_TABLES = [
  "players",
  "admins",
  "settings",
  "session_templates",
  "sessions",
  "session_participants",
  "session_items",
  "transactions",
  "audit_log",
];

export async function dumpAll(): Promise<{ exportedAt: string; tables: Record<string, unknown[]> }> {
  const tables: Record<string, unknown[]> = {};
  for (const t of BACKUP_TABLES) {
    tables[t] = await fetchAll<unknown>((from, to) => db().from(t).select("*").range(from, to));
  }
  return { exportedAt: new Date().toISOString(), tables };
}
