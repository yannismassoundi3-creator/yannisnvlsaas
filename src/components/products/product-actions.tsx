"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { deleteProduct, setProductArchived } from "@/lib/products/actions";
import { useLocale } from "@/i18n/client";
import { catalogCommon } from "@/i18n/messages/catalog-common";
import { productsMessages } from "@/i18n/messages/catalog-products";

export function ProductActions({ productId, archived, canDelete, disabled }: { productId: string; archived: boolean; canDelete: boolean; disabled: boolean }) {
  const router = useRouter();
  const locale = useLocale();
  const t = productsMessages[locale];
  const c = catalogCommon[locale];
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        disabled={disabled}
        loading={pending && !open}
        onClick={() =>
          startTransition(async () => {
            const r = await setProductArchived(productId, !archived);
            if (!r.ok) toast.error(r.message);
            else toast.success(archived ? t.productRestored : t.productArchived);
          })
        }
      >
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? t.restore : t.archive}
      </Button>
      {canDelete ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="danger-ghost" disabled={disabled}>
              <Trash2 aria-hidden />
              {c.delete}
            </Button>
          }
          title={t.deleteTitle}
          description={t.deleteDescription}
          confirmLabel={t.deleteConfirm}
          destructive
          pending={pending}
          onConfirm={() =>
            new Promise<void>((resolve) =>
              startTransition(async () => {
                const r = await deleteProduct(productId);
                resolve();
                setOpen(false);
                if (!r.ok) toast.error(r.message);
                else {
                  toast.success(t.productDeleted);
                  router.push("/app/products");
                }
              }),
            )
          }
        />
      ) : null}
    </>
  );
}
