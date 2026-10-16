"use client";

import { FlaskConical } from "lucide-react";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { createDemoStore } from "@/lib/onboarding/actions";
import { switchStore } from "@/lib/workspace/actions";

/** Opens the labelled sample store, creating it first if the organisation has none. */
export function SampleStoreButton({ demoStoreId, variant = "secondary", children }: { demoStoreId: string | null; variant?: ButtonProps["variant"]; children?: React.ReactNode }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant={variant}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result: { ok: boolean; message?: string } = demoStoreId ? await switchStore(demoStoreId) : await createDemoStore();
          if (!result.ok) toast.error(result.message ?? "Could not open the sample store.");
        })
      }
    >
      <FlaskConical aria-hidden />
      {children ?? (demoStoreId ? "Open the sample store" : "Create a sample store")}
    </Button>
  );
}
