import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Small context line above the title, e.g. the active store or a breadcrumb. */
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 space-y-1">
        {eyebrow ? <div className="text-sm text-ink-3">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tighter text-ink">{title}</h1>
        {description ? <p className="max-w-2xl text-md text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
