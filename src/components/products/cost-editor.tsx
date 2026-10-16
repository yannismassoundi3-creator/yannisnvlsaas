"use client";

import { Check, Pencil, X } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { currencySymbol } from "@/lib/finance/currency";
import { e4ToInputValue, formatUnitCost } from "@/lib/finance/money";
import { updateProductCost } from "@/lib/products/actions";

type Props = { productId: string; productName: string; unitCostE4: number | null; currency: string; disabled?: boolean };

/** Unit cost shown in the products table, editable in place. Missing costs are always visible. */
export function CostEditor({ productId, productName, unitCostE4, currency, disabled = false }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(unitCostE4 === null ? "" : e4ToInputValue(unitCostE4));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const save = () =>
    startTransition(async () => {
      const result = await updateProductCost(productId, value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setEditing(false);
      toast.success(result.unitCostE4 === null ? `Cost removed for ${productName}.` : `Cost saved for ${productName}.`);
      requestAnimationFrame(() => triggerRef.current?.focus());
    });

  if (!editing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setValue(unitCostE4 === null ? "" : e4ToInputValue(unitCostE4));
          setEditing(true);
        }}
        className="group inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-right hover:bg-hover focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:outline-none disabled:pointer-events-none"
      >
        {unitCostE4 === null ? <Badge tone="caution">No cost</Badge> : <span className="tabular">{formatUnitCost(unitCostE4, currency)}</span>}
        <span className="sr-only">{unitCostE4 === null ? `: add a unit cost for ${productName}` : `: edit the unit cost of ${productName}`}</span>
        {!disabled ? <Pencil className="size-3 text-ink-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden /> : null}
      </button>
    );
  }

  return (
    <form
      className="flex items-start justify-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="w-32">
        <Input
          id={id}
          inputSize="sm"
          inputMode="decimal"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
              setError(null);
              requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
          leading={currencySymbol(currency)}
          aria-label={`Unit cost for ${productName}, excluding VAT`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="0.00"
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="mt-1 text-left text-xs text-negative-700">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" size="icon-sm" variant="secondary" loading={pending} aria-label="Save cost">
        <Check />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Cancel"
        onClick={() => {
          setEditing(false);
          setError(null);
        }}
      >
        <X />
      </Button>
    </form>
  );
}
