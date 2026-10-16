"use client";

import { CircleCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";

/** Confirmation shown on the home page after an account has been deleted. Read client-side so the page stays static. */
export function AccountDeletedNotice() {
  const params = useSearchParams();
  if (params.get("account") !== "deleted") return null;
  return (
    <div role="status" className="border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-center text-sm text-emerald-800">
      <CircleCheck className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
      Your account and all its data have been deleted. Any subscription was cancelled. Thank you for trying Narixia.
    </div>
  );
}
