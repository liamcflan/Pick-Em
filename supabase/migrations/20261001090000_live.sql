-- 0009 live: stream game updates to browsers. The live-score job writes `games` every couple of
-- minutes while anything is in play; Supabase Realtime broadcasts those rows (RLS still applies,
-- games are readable by any signed-in member) and the picks page / dashboard refresh themselves.
-- Cover probability is derived in the app from score, clock and the pick's own line; nothing to
-- store.

alter publication supabase_realtime add table public.games;
