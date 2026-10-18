import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Thumbnail of an item (short-lived signed URL of its stored photo) or a
 * neutral placeholder. Decorative: the item's name is always next to it.
 */
export function ItemThumb({ url, size = "md", className }: { url: string | null | undefined; size?: "sm" | "md"; className?: string }) {
  const box = size === "sm" ? "size-10" : "size-12";
  if (url) {
    return (
      // A signed Storage URL that changes on every page view: next/image would only add a proxy hop.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" width={96} height={96} loading="lazy" decoding="async" className={cn(box, "shrink-0 rounded-md border border-line bg-sunken object-cover", className)} />
    );
  }
  return (
    <span aria-hidden className={cn(box, "flex shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-4", className)}>
      <Shirt className={size === "sm" ? "size-4" : "size-5"} />
    </span>
  );
}
