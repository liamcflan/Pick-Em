import type { Metadata } from "next";

import { SettingsForm } from "@/components/admin/settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Site settings" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const { data: s } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  if (!s) return <p className="text-destructive text-sm">Settings row is missing.</p>;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Site settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Season rules</CardTitle>
          <CardDescription>
            Applies to every league. Changes are audited. Each league sets its own starting balance
            when created; this is the default offered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            values={{
              spreadLockDay: s.spread_lock_day,
              spreadLockTime: String(s.spread_lock_time).slice(0, 5),
              timezone: s.timezone,
              defaultStartingBalanceDollars: Math.round(s.default_starting_balance_cents / 100),
              betUnitDollars: Math.round(s.bet_unit_cents / 100),
              hidePicksUntilKickoff: s.hide_picks_until_kickoff,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
