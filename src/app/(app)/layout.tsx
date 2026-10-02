import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/actions";
import { Avatar } from "@/components/profile/avatar";
import { Button } from "@/components/ui/button";
import { createClient, getUser } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getUser();
  if (!user) redirect("/sign-in");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_site_admin, avatar_path")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
          <nav className="flex items-center gap-4 text-sm font-medium" aria-label="Main">
            <Link href="/dashboard" className="text-base font-semibold tracking-tight">
              10K Pool HQ
            </Link>
            <Link href="/leagues" className="text-muted-foreground hover:text-foreground">
              Leagues
            </Link>
            {profile?.is_site_admin ? (
              <Link href="/admin" className="text-muted-foreground hover:text-foreground">
                Admin
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="flex items-center gap-2 text-sm hover:underline">
              {/* Announced as "Profile: <name>" so the accessible name contains the visible text. */}
              <span className="sr-only">Profile: </span>
              <Avatar
                name={profile?.display_name ?? user.email ?? "?"}
                path={profile?.avatar_path}
                size="sm"
              />
              <span
                className="text-muted-foreground max-w-[10rem] truncate"
                data-testid="display-name"
              >
                {profile?.display_name ?? user.email}
              </span>
            </Link>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
