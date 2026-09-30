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

  return <div className="space-y-6">{children}</div>;
}
