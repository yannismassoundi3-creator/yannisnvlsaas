import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Table primitives. Numeric columns use `numeric` cells: right aligned with
 * tabular figures so amounts line up digit by digit.
 */
export function TableContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("relative w-full overflow-x-auto scrollbar-thin", className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-sunken/70", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&>tr:last-child]:border-0", className)} {...props} />;
}

export function TFoot({ className, ...props }: ComponentProps<"tfoot">) {
  return <tfoot className={cn("border-t border-line-strong bg-sunken/40 font-medium", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line transition-colors", className)} {...props} />;
}

type CellProps = { numeric?: boolean };

export function TH({ className, numeric, ...props }: ComponentProps<"th"> & CellProps) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-ink-3 first:pl-5 last:pr-5",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, numeric, ...props }: ComponentProps<"td"> & CellProps) {
  return (
    <td
      className={cn(
        "h-11 px-3 align-middle text-ink first:pl-5 last:pr-5",
        numeric && "text-right whitespace-nowrap tabular",
        className,
      )}
      {...props}
    />
  );
}

export function TableCaption({ className, ...props }: ComponentProps<"caption">) {
  return <caption className={cn("px-5 py-3 text-left text-xs text-ink-3", className)} {...props} />;
}
