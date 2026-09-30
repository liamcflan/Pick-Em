import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient, getUser } from "@/lib/supabase/server";

/** Site-admin area. Non-admins get a 404 so the section's existence is not advertised. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_site_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_site_admin) notFound();

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-4 text-sm" aria-label="Admin">
        <Link href="/admin" className="text-muted-foreground hover:text-foreground">
          Overview
        </Link>
        <Link href="/admin/lines" className="text-muted-foreground hover:text-foreground">
          Lines
        </Link>
        <Link href="/admin/leagues" className="text-muted-foreground hover:text-foreground">
          Leagues
        </Link>
        <Link href="/admin/settings" className="text-muted-foreground hover:text-foreground">
          Settings
        </Link>
        <Link href="/admin/audit" className="text-muted-foreground hover:text-foreground">
          Audit log
        </Link>
      </nav>
      {children}
    </div>
  );
}
