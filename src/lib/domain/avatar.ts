/** Helpers for member logos stored in the public `logos` bucket. Pure. */

const AVATAR_PATH = /^([0-9a-f-]{36})\/[A-Za-z0-9._-]+$/;

/** True when `path` is well-formed and lives in the given member's own folder. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  const m = AVATAR_PATH.exec(path);
  return !!m && m[1] === userId;
}

export function avatarUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/logos/${path}`;
}

/** Up to two initials from a display name, for the fallback badge. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Object key for a freshly uploaded logo: unique per upload so CDN caches never go stale. */
export function newAvatarPath(userId: string, nowMs: number): string {
  return `${userId}/logo-${nowMs}.webp`;
}
