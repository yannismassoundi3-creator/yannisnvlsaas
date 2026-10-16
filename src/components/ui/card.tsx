import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface shadow-xs", className)}
      {...props}
    />
  );
}

type CardHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** Heading level for document outline. */
  as?: "h2" | "h3";
  id?: string;
};

export function CardHeader({ title, description, actions, className, as: Heading = "h2", id }: CardHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-4", className)}>
      <div className="min-w-0 space-y-0.5">
        <Heading id={id} className="text-md font-semibold tracking-tight text-ink">
          {title}
        </Heading>
        {description ? <p className="text-sm text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"footer">) {
  return (
    <footer
      className={cn("flex items-center gap-3 border-t border-line px-5 py-3 text-sm text-ink-3", className)}
      {...props}
    />
  );
}
