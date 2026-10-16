import { AlertTriangle, CircleCheck, Info, OctagonAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type AlertTone = "info" | "positive" | "caution" | "negative";

const alertTone: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "border-info-100 bg-info-50 text-info-700", icon: <Info aria-hidden /> },
  positive: { box: "border-emerald-100 bg-emerald-50 text-emerald-800", icon: <CircleCheck aria-hidden /> },
  caution: { box: "border-caution-100 bg-caution-50 text-caution-800", icon: <AlertTriangle aria-hidden /> },
  negative: { box: "border-negative-100 bg-negative-50 text-negative-800", icon: <OctagonAlert aria-hidden /> },
};

type AlertProps = Omit<ComponentProps<"div">, "title"> & {
  tone?: AlertTone;
  title?: ReactNode;
  action?: ReactNode;
};

/** Inline notice. Pairs an icon with text so meaning never relies on colour alone. */
export function Alert({ tone = "info", title, action, className, children, ...props }: AlertProps) {
  const t = alertTone[tone];
  return (
    <div
      role={tone === "negative" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border px-3.5 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0", t.box, className)}
      {...props}
    >
      {t.icon}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_18rem] space-y-0.5">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className="text-ink-2 [&_a]:font-medium [&_a]:text-current [&_a]:underline">{children}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-shimmer rounded-sm bg-sunken motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

/** Empty states always explain what is missing and offer the next step. */
export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex size-10 items-center justify-center rounded-md border border-line bg-sunken text-ink-3 [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <h3 className="text-md font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-ink-3">{description}</p> : null}
      {actions ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      className={cn(vertical ? "h-full w-px" : "h-px w-full", "shrink-0 bg-line", className)}
    />
  );
}
