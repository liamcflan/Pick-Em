import type { Metadata } from "next";
import Link from "next/link";

import { publicEnv } from "@/lib/env";
import { buildInfo, overall, schemaState, type Check } from "@/lib/status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Status", robots: { index: false, follow: false } };

const STATE_TEXT = { ok: "OK", warn: "Needs setup", fail: "Failing" } as const;
const STATE_CLASS = {
  ok: "text-green-700 dark:text-green-400",
  warn: "text-amber-700 dark:text-amber-400",
  fail: "text-red-700 dark:text-red-400",
} as const;

async function authReachable(): Promise<Check> {
  const label = "Supabase reachable";
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.ok
      ? { label, state: "ok", detail: new URL(publicEnv.NEXT_PUBLIC_SUPABASE_URL).host }
      : {
          label,
          state: "fail",
          detail: `Auth answered ${res.status}. Check the project URL and publishable key in Vercel.`,
        };
  } catch {
    return {
      label,
      state: "fail",
      detail: "No answer within 5 s. Is the Supabase project paused or the URL wrong?",
    };
  }
}

/**
 * Public setup and health page. It reveals nothing secret: the Supabase URL and publishable key
 * are already in every page's JavaScript, the repository is public, and secrets are reported only
 * as set or not set.
 */
export default async function StatusPage() {
  const build = buildInfo(process.env);
  const supabase = await createClient();

  const [auth, firstTable, latestTable, claims] = await Promise.all([
    authReachable(),
    // First migration's table, then a column added by the newest migration. A GET for zero rows
    // rather than HEAD: HEAD responses have no body, so the error code would be lost.
    supabase.from("profiles").select("id").limit(0),
    supabase.from("profiles").select("reminders_enabled").limit(0),
    supabase.auth.getClaims(),
  ]);
  const userId = claims.data?.claims?.sub ?? null;

  const first = schemaState(firstTable.error);
  const latest = schemaState(latestTable.error);
  const database: Check =
    first === "present" && latest === "present"
      ? { label: "Database tables", state: "ok", detail: "All migrations applied." }
      : first === "missing"
        ? {
            label: "Database tables",
            state: "warn",
            detail:
              "No tables yet. Run `supabase db push` from the repo (docs/OPERATIONS.md, step 1).",
          }
        : latest === "missing"
          ? {
              label: "Database tables",
              state: "warn",
              detail: "Older migrations only. Run `supabase db push` to apply the newest ones.",
            }
          : {
              label: "Database tables",
              state: "fail",
              detail:
                firstTable.error?.message ||
                latestTable.error?.message ||
                `Supabase answered ${firstTable.status} / ${latestTable.status}.`,
            };

  const checks: Check[] = [
    auth,
    database,
    {
      label: "App address",
      state: publicEnv.NEXT_PUBLIC_APP_URL ? "ok" : "warn",
      detail: publicEnv.NEXT_PUBLIC_APP_URL ?? "NEXT_PUBLIC_APP_URL is not set in Vercel.",
    },
    {
      label: "Job secret",
      state: process.env.JOB_SECRET ? "ok" : "warn",
      detail: process.env.JOB_SECRET
        ? "Set."
        : "JOB_SECRET is not set; admin job buttons will not work.",
    },
  ];

  if (userId && first === "present") {
    const [{ data: profile }, { data: season }] = await Promise.all([
      supabase.from("profiles").select("display_name, is_site_admin").eq("id", userId).single(),
      supabase.from("seasons").select("year").eq("is_active", true).maybeSingle(),
    ]);
    checks.push(
      {
        label: "Your account",
        state: profile?.is_site_admin ? "ok" : "warn",
        detail: profile?.is_site_admin
          ? `${profile.display_name}, site admin.`
          : "Signed in, not a site admin yet (docs/OPERATIONS.md, step 5).",
      },
      {
        label: "Active season",
        state: season ? "ok" : "warn",
        detail: season
          ? `${season.year}`
          : "None yet. Use Admin → Sync schedule once you are a site admin.",
      },
    );
  }

  const summary = overall(checks);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Status</h1>
        <p className={STATE_CLASS[summary]} data-testid="status-summary">
          {summary === "ok"
            ? "Everything is set up."
            : summary === "warn"
              ? "Running, with setup steps left."
              : "Something is failing."}
        </p>
      </div>

      <section aria-labelledby="build-title" className="space-y-2">
        <h2 id="build-title" className="font-semibold">
          This deployment
        </h2>
        <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Environment</dt>
          <dd>{build.environment}</dd>
          <dt className="text-muted-foreground">Branch</dt>
          <dd>{build.branch ?? "local"}</dd>
          <dt className="text-muted-foreground">Commit</dt>
          <dd data-testid="status-commit">
            {build.commit ? (
              <a
                className="underline"
                href={`https://github.com/liamcflan/Pick-Em/commit/${build.commit}`}
              >
                {build.commit}
              </a>
            ) : (
              "local build"
            )}
            {build.message ? (
              <span className="text-muted-foreground"> · {build.message}</span>
            ) : null}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="checks-title" className="space-y-2">
        <h2 id="checks-title" className="font-semibold">
          Checks
        </h2>
        <ul className="divide-y rounded-lg border text-sm" data-testid="status-checks">
          {checks.map((c) => (
            <li key={c.label} className="flex flex-col gap-1 p-3 sm:flex-row sm:gap-4">
              <span className="w-40 shrink-0 font-medium">{c.label}</span>
              <span className={`w-24 shrink-0 font-medium ${STATE_CLASS[c.state]}`}>
                {STATE_TEXT[c.state]}
              </span>
              <span className="text-muted-foreground break-words">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm">
        <Link href="/" className="underline">
          Home
        </Link>
        {" · "}
        <Link href={userId ? "/dashboard" : "/sign-in"} className="underline">
          {userId ? "Dashboard" : "Sign in"}
        </Link>
      </p>
    </main>
  );
}
