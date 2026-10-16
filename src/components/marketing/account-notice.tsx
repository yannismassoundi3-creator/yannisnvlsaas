"use client";

import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "@/i18n/client";
import { marketingCommon } from "@/i18n/messages/marketing-common";

/** Confirmation shown on the home page after an account has been deleted. Read client-side so the page stays static. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  const t = marketingCommon[useLocale()];
  if (params.get("account") !== "deleted") return null;
  return (
    <div role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-center text-sm text-emerald-800">
      <CircleCheck className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
      {t.accountDeleted}
    </div>
  );
}
