"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Re-renders the page when any game in the week changes (score, clock, status). The live-score
 * job writes `games` every couple of minutes while a game is on; Supabase Realtime streams those
 * rows, so no polling from the browser. Mounted only while something is (about to be) in play.
 */
export function LiveRefresher({ weekId }: { weekId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`games-week-${weekId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "games", filter: `week_id=eq.${weekId}` },
        () => {
          // several games update in the same sync; refresh once
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 750);
        },
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [weekId, router]);

  return null;
}
