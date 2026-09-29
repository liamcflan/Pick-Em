/**
 * HTTP security headers, applied by the proxy on every HTML response.
 *
 * The Content Security Policy uses a per-request nonce with 'strict-dynamic' for scripts, which is
 * the strongest practical policy for a Next.js app: only scripts the server rendered with the
 * nonce (and scripts they load) may run, so injected <script> tags are inert even if an XSS bug
 * slips through. Inline *styles* are allowed because Next/React emit style attributes during SSR
 * and they carry no script-execution risk.
 */

export type CspInput = {
  nonce: string;
  supabaseUrl: string;
  isDev: boolean;
  /** Vercel preview deployments inject the vercel.live toolbar. */
  isVercelPreview?: boolean;
};

export function buildCsp({ nonce, supabaseUrl, isDev, isVercelPreview = false }: CspInput): string {
  const supabase = new URL(supabaseUrl);
  const supabaseOrigin = supabase.origin;
  const supabaseWs = `${supabase.protocol === "https:" ? "wss" : "ws"}://${supabase.host}`;

  const scriptSrc = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDev) scriptSrc.push("'unsafe-eval'"); // React dev tooling only; never in production
  if (isVercelPreview) scriptSrc.push("https://vercel.live");

  const connectSrc = ["'self'", supabaseOrigin, supabaseWs];
  if (isVercelPreview) connectSrc.push("https://vercel.live", "wss://ws-us3.pusher.com");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", supabaseOrigin, "https://lh3.googleusercontent.com"],
    "font-src": ["'self'"],
    "connect-src": connectSrc,
    // Server-action redirects after a form POST are subject to form-action in Chrome, so the
    // Google OAuth hop (via Supabase) must be listed explicitly.
    "form-action": ["'self'", supabaseOrigin, "https://accounts.google.com"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (isVercelPreview) directives["frame-src"] = ["https://vercel.live"];
  if (!isDev) directives["upgrade-insecure-requests"] = [];

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

/** Headers that are the same for every response. */
export function staticSecurityHeaders(isProduction: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
  if (isProduction) {
    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
  }
  return headers;
}

export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
