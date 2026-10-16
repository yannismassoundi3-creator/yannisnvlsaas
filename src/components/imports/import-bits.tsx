"use client";

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toCsv } from "@/lib/csv";
import { IMPORT_KINDS, type ImportKind } from "@/lib/imports/schema";

export const STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "positive" | "negative" | "caution" | "info" }> = {
  staging: { label: "Uploading", tone: "info" },
  validated: { label: "Ready to confirm", tone: "caution" },
  committing: { label: "Importing", tone: "info" },
  committed: { label: "Imported", tone: "positive" },
  failed: { label: "Failed", tone: "negative" },
  rolled_back: { label: "Undone", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export function ImportStatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Downloads a template generated in the browser: headers plus fictional example rows. */
export function TemplateButton({ kind, variant = "secondary", size = "sm" }: { kind: ImportKind; variant?: "secondary" | "ghost" | "link"; size?: "sm" | "md" }) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => {
        const [header, ...rows] = IMPORT_KINDS[kind].template;
        const blob = new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `narixia-${kind.replace("_", "-")}-template.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }}
    >
      <Download aria-hidden />
      {IMPORT_KINDS[kind].label} template
    </Button>
  );
}
