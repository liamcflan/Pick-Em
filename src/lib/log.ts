/**
 * Structured JSON logging for the Next.js side. One JSON object per line on stdout, which Vercel
 * captures and which matches the shape the Python jobs emit (see pickem/log.py), so both halves of
 * the system can be searched the same way.
 *
 * Never log secrets, tokens, or email addresses. User ids are fine.
 */
type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields: Fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit("debug", msg, fields),
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};

/** Serialize an unknown thrown value into log-safe fields. */
export function errorFields(err: unknown): Fields {
  if (err instanceof Error) return { error: err.message, error_name: err.name };
  return { error: String(err) };
}
