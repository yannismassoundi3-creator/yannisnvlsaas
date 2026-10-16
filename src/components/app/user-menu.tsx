"use client";

import { ChevronsUpDown, LifeBuoy, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/menu";
import { signOut } from "@/lib/auth/actions";
import { FeedbackDialog } from "./feedback-dialog";

function initials(name: string | null, email: string | null) {
  const source = name?.trim() || email || "?";
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 && name ? parts[1][0] : "")).toUpperCase();
}

export function UserMenu({ name, email, organization }: { name: string | null; email: string | null; organization: string }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-hover">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-semibold text-white" aria-hidden>
            {initials(name, email)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{name || email}</span>
            <span className="block truncate text-xs text-ink-3">{organization}</span>
          </span>
          <span className="sr-only">, account menu</span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-3" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuLabel className="truncate">{email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/app/settings">
              <Settings aria-hidden />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <LifeBuoy aria-hidden />
            Help &amp; feedback
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void signOut();
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  );
}
