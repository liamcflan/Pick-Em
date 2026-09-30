import type { Json } from "@/lib/supabase/database.types";

export type AuditRowLike = {
  action: "insert" | "update" | "delete";
  old_data: Json;
  new_data: Json;
};

export type FieldChange = { key: string; from: string | null; to: string | null };

const NOISE = new Set(["updated_at", "created_at"]);

function asRecord(v: Json): Record<string, Json | undefined> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, Json>) : {};
}

export function formatValue(v: Json | undefined, max = 48): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Which fields an audit row changed, for the admin viewer. Pure. */
export function changedFields(row: AuditRowLike): FieldChange[] {
  const before = asRecord(row.old_data);
  const after = asRecord(row.new_data);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: FieldChange[] = [];
  for (const key of [...keys].sort()) {
    if (NOISE.has(key)) continue;
    const from = before[key];
    const to = after[key];
    if (row.action === "update" && JSON.stringify(from) === JSON.stringify(to)) continue;
    if (row.action === "insert" && (to === null || to === undefined)) continue;
    out.push({ key, from: formatValue(from), to: formatValue(to) });
  }
  return out;
}
