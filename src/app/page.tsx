import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Pick-Em</h1>
        <p className="text-muted-foreground mx-auto max-w-md text-lg">
          NFL spread pick&rsquo;em for friend groups. Start with a bankroll, bet the spread every
          week, and see who has the most when the playoffs start.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {user ? (
          <Button asChild size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        ) : (
          <>
            <Button asChild size="lg">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-up">Create account</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
