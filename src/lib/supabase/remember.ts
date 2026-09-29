/**
 * "Remember me" support.
 *
 * Supabase's SSR helper always writes auth cookies with a 400-day max-age. To honour an unchecked
 * "remember me" box we strip the expiry so the browser treats them as session cookies (gone when
 * the browser closes). The preference itself is stored in a small, non-sensitive cookie so both
 * the server client and the browser client can consult it on every cookie write.
 */
export const REMEMBER_COOKIE = "pickem_remember";
export const REMEMBER_MAX_AGE = 400 * 24 * 60 * 60;

export type CookieAttrs = { maxAge?: number; expires?: Date | string | number } & Record<
  string,
  unknown
>;

/** Cookies default to persistent unless the preference cookie explicitly says "0". */
export function shouldPersist(rememberValue: string | undefined | null): boolean {
  return rememberValue !== "0";
}

/** Return cookie attributes adjusted for the persistence preference. */
export function applyPersistence<T extends CookieAttrs>(options: T, persist: boolean): T {
  if (persist) return options;
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  void _maxAge;
  void _expires;
  return rest as T;
}
