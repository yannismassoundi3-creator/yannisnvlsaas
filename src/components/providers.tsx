"use client";

import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/overlay";
import { Toaster } from "@/components/ui/toaster";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={150}>
      {children}
      <Toaster />
    </TooltipProvider>
  );
}
