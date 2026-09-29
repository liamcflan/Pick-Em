import { describe, expect, it } from "vitest";

import { buildCsp, generateNonce, staticSecurityHeaders } from "./headers";

const base = { nonce: "abc123", supabaseUrl: "https://xyz.supabase.co", isDev: false };

describe("buildCsp", () => {
  it("uses a nonce with strict-dynamic and no unsafe-inline for scripts", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it("allows Supabase over https and websockets", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("connect-src 'self' https://xyz.supabase.co wss://xyz.supabase.co");
  });

  it("permits the OAuth form-action hop and blocks framing", () => {
    const csp = buildCsp(base);
    expect(csp).toContain("form-action 'self' https://xyz.supabase.co https://accounts.google.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("only adds unsafe-eval in development", () => {
    expect(buildCsp({ ...base, isDev: true })).toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(buildCsp({ ...base, isDev: true })).not.toContain("upgrade-insecure-requests");
  });

  it("adds vercel.live only for preview deployments", () => {
    expect(buildCsp(base)).not.toContain("vercel.live");
    expect(buildCsp({ ...base, isVercelPreview: true })).toContain("https://vercel.live");
  });
});

describe("staticSecurityHeaders", () => {
  it("sets HSTS only in production", () => {
    expect(staticSecurityHeaders(false)["Strict-Transport-Security"]).toBeUndefined();
    expect(staticSecurityHeaders(true)["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(staticSecurityHeaders(true)["X-Frame-Options"]).toBe("DENY");
  });
});

describe("generateNonce", () => {
  it("is base64, 128 bits, and unique per call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(a, "base64")).toHaveLength(16);
    expect(a).not.toBe(b);
  });
});
