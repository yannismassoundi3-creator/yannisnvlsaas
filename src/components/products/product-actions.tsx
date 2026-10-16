"use client";

import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { deleteProduct, setProductArchived } from "@/lib/products/actions";

export function ProductActions({ productId, archived, canDelete, disabled }: { productId: string; archived: boolean; canDelete: boolean; disabled: boolean }) {
  const router = useRouter();
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
            else toast.success(archived ? "Product restored." : "Product archived. Its sales stay in your reports.");
          })
        }
      >
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
        {archived ? "Restore" : "Archive"}
      </Button>
      {canDelete ? (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          trigger={
            <Button variant="danger-ghost" disabled={disabled}>
              <Trash2 aria-hidden />
              Delete
            </Button>
          }
          title="Delete this product?"
          description="It has never been sold, so no report changes. This cannot be undone."
          confirmLabel="Delete product"
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
                  toast.success("Product deleted.");
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
