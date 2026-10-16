import type { ReactNode } from "react";

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="rounded-lg border border-line bg-surface p-6 shadow-sm sm:p-7">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <div className="mt-1.5 text-sm text-ink-2">{description}</div> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-ink-2">{footer}</div> : null}
    </>
  );
}
