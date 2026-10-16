"use client";

import { Check, ChevronsUpDown, Plus, Store as StoreIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { toast } from "@/components/ui/toaster";
import { switchStore } from "@/lib/workspace/actions";
import { cn } from "@/lib/utils";

export type SwitcherStore = { id: string; name: string; currency: string; isDemo: boolean };

export function StoreSwitcher({ stores, activeId }: { stores: SwitcherStore[]; activeId: string | null }) {
  const [pending, startTransition] = useTransition();
  const active = stores.find((s) => s.id === activeId) ?? stores[0];

  function choose(id: string) {
    if (id === activeId) return;
    startTransition(async () => {
      const result = await switchStore(id);
      if (!result.ok) toast.error("Could not switch store.");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md border border-line bg-surface px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-hover",
          pending && "opacity-60",
        )}
        aria-label="Switch store"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-2" aria-hidden>
          <StoreIcon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{active?.name ?? "No store"}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-3">
            {active?.currency}
            {active?.isDemo ? <Badge tone="demo" className="px-1 py-0">Demo</Badge> : null}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Stores</DropdownMenuLabel>
        {stores.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => choose(s.id)}>
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            {s.isDemo ? <Badge tone="demo">Demo</Badge> : <span className="text-xs text-ink-3">{s.currency}</span>}
            {s.id === active?.id ? <Check className="!text-ink" aria-label="Current store" /> : <span className="w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/settings?section=stores">
            <Plus aria-hidden />
            Manage stores
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
