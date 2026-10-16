"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/controls";

type Panel = { value: string; label: string; content: ReactNode };

/** Tabbed product tour. Panels are rendered on the server and passed in. */
export function PreviewTabs({ panels }: { panels: Panel[] }) {
  return (
    <Tabs defaultValue={panels[0]?.value}>
      <div className="flex justify-center">
        <TabsList aria-label="Product views">
          {panels.map((p) => (
            <TabsTrigger key={p.value} value={p.value} className="px-4">
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {panels.map((p) => (
        <TabsContent key={p.value} value={p.value} className="mt-6">
          {p.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
