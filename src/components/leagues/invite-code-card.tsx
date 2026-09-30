"use client";

import { Check, Copy, RefreshCw } from "lucide-react";
import { useState } from "react";

import { rotateInviteCode } from "@/app/(app)/leagues/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatInviteCode } from "@/lib/domain/invite-code";

export function InviteCodeCard({ leagueId, code }: { leagueId: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const pretty = formatInviteCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. insecure context); the code is still visible to select manually
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite code</CardTitle>
        <CardDescription>
          Share this with friends. Rotating it invalidates the old one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <code
          data-testid="invite-code"
          className="bg-muted rounded-md px-3 py-2 font-mono text-lg tracking-widest"
        >
          {pretty}
        </code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <form action={rotateInviteCode}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <Button type="submit" variant="ghost" size="sm">
            <RefreshCw />
            Rotate
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
