import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Leaderboard</CardTitle>
            <CardDescription>Your leagues and balances will appear here.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Leagues, invite codes and picks arrive in Phase 1.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>This week</CardTitle>
            <CardDescription>Your picks and their live status.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">No picks yet.</CardContent>
        </Card>
      </div>
    </div>
  );
}
