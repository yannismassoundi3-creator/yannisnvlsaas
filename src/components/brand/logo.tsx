import { cn } from "@/lib/utils";

type MarkProps = {
  className?: string;
  /** "light" for use on ivory/white backgrounds, "dark" on navy backgrounds. */
  tone?: "light" | "dark";
  title?: string;
};

/**
 * The Narixia mark: a geometric "N" set in a navy tile. The emerald right
 * pillar rises above the rest — the share of revenue a business actually keeps.
 */
export function LogoMark({ className, tone = "light", title }: MarkProps) {
  const tile = tone === "light" ? "#172033" : "#F8F7F4";
  const ink = tone === "light" ? "#F8F7F4" : "#172033";
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-7 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="8" fill={tile} />
      {/* left pillar */}
      <rect x="8.5" y="11" width="3.5" height="13" rx="1" fill={ink} />
      {/* diagonal */}
      <path d="M9.3 11.7 11.9 10.9 22.6 23.4 20 24Z" fill={ink} />
      {/* right pillar, rising above the rest: the margin a business keeps */}
      <rect x="20" y="7" width="3.5" height="17" rx="1" fill={tone === "light" ? "#2E9A7C" : "#21866B"} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  tone?: "light" | "dark";
  /** Hide the wordmark on very small layouts. */
  markOnly?: boolean;
};

export function Logo({ className, tone = "light", markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark tone={tone} />
      {markOnly ? (
        <span className="sr-only">Narixia</span>
      ) : (
        <span
          className={cn(
            "text-[17px] leading-none font-semibold tracking-tight",
            tone === "light" ? "text-ink" : "text-ivory",
          )}
        >
          Narixia
        </span>
      )}
    </span>
  );
}
