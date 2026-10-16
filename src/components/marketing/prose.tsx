import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageIntro({ eyebrow, title, children, className }: { eyebrow?: string; title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto max-w-6xl px-4 pt-14 pb-10 sm:px-6 sm:pt-20", className)}>
      <div className="max-w-3xl">
        {eyebrow ? <p className="text-sm font-medium text-emerald-700">{eyebrow}</p> : null}
        <h1 className="mt-2 text-4xl font-semibold tracking-tighter text-ink sm:text-5xl">{title}</h1>
        {children ? <div className="mt-5 text-lg text-ink-2">{children}</div> : null}
      </div>
    </div>
  );
}

/** Long-form text for legal and informational pages. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-3xl text-base leading-7 text-ink-2",
        "[&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-ink",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-md [&_h3]:font-semibold [&_h3]:text-ink",
        "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline-offset-2 hover:[&_a]:underline",
        "[&_strong]:font-semibold [&_strong]:text-ink",
        "[&_table]:my-4 [&_table]:w-full [&_table]:text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function NotConfigured({ children }: { children: ReactNode }) {
  return <span className="rounded-xs bg-caution-50 px-1 text-caution-800">{children}</span>;
}
