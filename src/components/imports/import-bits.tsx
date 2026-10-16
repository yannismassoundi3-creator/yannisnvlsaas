"use client";

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/i18n/client";
import { importUi } from "@/i18n/messages/imports-ui";
import { toCsv } from "@/lib/csv";
import { IMPORT_KINDS, kindCopy, type ImportKind } from "@/lib/imports/schema";

type Tone = "neutral" | "positive" | "negative" | "caution" | "info";
type StatusKey = keyof (typeof importUi)["en"]["status"];

const STATUS_TONES: Record<StatusKey, Tone> = {
  staging: "info",
  validated: "caution",
  committing: "info",
  committed: "positive",
  failed: "negative",
  rolled_back: "neutral",
  cancelled: "neutral",
};

export function ImportStatusBadge({ status }: { status: string }) {
  const locale = useLocale();
  const known = status in STATUS_TONES ? (status as StatusKey) : null;
  return <Badge tone={known ? STATUS_TONES[known] : "neutral"}>{known ? importUi[locale].status[known] : status}</Badge>;
}

/** Downloads a template generated in the browser: headers plus fictional example rows. */
export function TemplateButton({ kind, variant = "secondary", size = "sm" }: { kind: ImportKind; variant?: "secondary" | "ghost" | "link"; size?: "sm" | "md" }) {
  const locale = useLocale();
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
      {importUi[locale].template(kindCopy(kind, locale).label)}
    </Button>
  );
}
