/** Invite codes are 8 characters from an alphabet without look-alikes (no 0/O/1/I). */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Strip anything that is not a code character and upper-case the rest. "ab-cd efgh" -> "ABCDEFGH" */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidInviteCode(input: string): boolean {
  const code = normalizeInviteCode(input);
  return code.length === 8 && [...code].every((c) => INVITE_CODE_ALPHABET.includes(c));
}

/** "ABCDEFGH" -> "ABCD-EFGH" for display. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}
