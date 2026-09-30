import { avatarUrl, initials } from "@/lib/domain/avatar";
import { publicEnv } from "@/lib/env";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-6 text-[10px]", md: "size-9 text-xs", lg: "size-24 text-2xl" } as const;

/** A member's logo, or their initials when they have not uploaded one. */
export function Avatar({
  name,
  path,
  size = "md",
  className,
}: {
  name: string;
  path: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const url = avatarUrl(publicEnv.NEXT_PUBLIC_SUPABASE_URL, path);
  const base = cn("shrink-0 rounded-full object-cover", SIZES[size], className);
  if (url) {
    // A 256 px image straight from the storage CDN; the Next image optimizer adds nothing here
    // and its free-tier quota is better kept for later.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={base} width={256} height={256} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        base,
        "bg-muted text-muted-foreground inline-flex items-center justify-center font-semibold",
      )}
    >
      {initials(name)}
    </span>
  );
}
