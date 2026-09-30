import { describeEvent, type LeagueEventLike } from "@/lib/domain/events";
import { formatMoney } from "@/lib/domain/money";

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export type FeedItem = LeagueEventLike & { id: number; created_at: string; leagueName?: string };

export function NewsFeed({ items, names }: { items: FeedItem[]; names: Record<string, string> }) {
  const lookup = (id: string | null) => (id && names[id]) || "A former member";
  if (!items.length)
    return <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>;
  return (
    <ul className="divide-y text-sm">
      {items.map((e) => (
        <li key={e.id} className="py-2">
          <div>{describeEvent(e, lookup, formatMoney)}</div>
          <div className="text-muted-foreground text-xs">
            {e.leagueName ? `${e.leagueName} · ` : ""}
            {fmt.format(new Date(e.created_at))}
          </div>
        </li>
      ))}
    </ul>
  );
}
