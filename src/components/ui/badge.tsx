import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-sunken text-ink-2 ring-1 ring-line ring-inset",
        positive: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100 ring-inset",
        negative: "bg-negative-50 text-negative-800 ring-1 ring-negative-100 ring-inset",
        caution: "bg-caution-50 text-caution-800 ring-1 ring-caution-100 ring-inset",
        info: "bg-info-50 text-info-700 ring-1 ring-info-100 ring-inset",
        /** Marks sample data everywhere it appears. */
        demo: "bg-caution-50 text-caution-800 ring-1 ring-caution-100 ring-inset uppercase tracking-wide text-2xs",
        outline: "text-ink-2 ring-1 ring-line-strong ring-inset",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
