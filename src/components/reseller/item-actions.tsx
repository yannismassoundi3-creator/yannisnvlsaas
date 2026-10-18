"use client";

import { Pencil, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useLocale } from "@/i18n/client";
import { resellerMessages } from "@/i18n/messages/reseller";
import { deleteProduct } from "@/lib/products/actions";
import { deleteOrder } from "@/lib/transactions/actions";
import { EditItemDialog } from "./quick-actions";

/**
 * Edit and delete buttons of an item (existing product flows). Items with a
 * sale can be edited (e.g. their quantity, never below the pieces sold) but
 * not deleted: the sale must be undone first.
 */
export function StockItemActions({
  productId,
  name,
  unitCostE4,
  acquiredOn,
  quantity,
  soldUnits,
  currency,
  today,
  disabled,
}: {
  productId: string;
  name: string;
  unitCostE4: number | null;
  acquiredOn: string | null;
  quantity: number;
  soldUnits: number;
  currency: string;
  today: string;
  disabled: boolean;
}) {
  const m = resellerMessages[useLocale()];
  const t = m.items;
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`${t.edit} : ${name}`} title={t.edit} onClick={() => setEditOpen(true)} disabled={disabled}>
        <Pencil />
      </Button>
      <EditItemDialog open={editOpen} onOpenChange={setEditOpen} productId={productId} initial={{ name, unitCostE4, acquiredOn, quantity, soldUnits }} currency={currency} today={today} />
      {soldUnits > 0 ? null : (
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        trigger={
          <Button variant="ghost" size="icon" aria-label={`${t.delete} : ${name}`} title={t.delete}>
            <Trash2 />
          </Button>
        }
        title={t.deleteTitle(name)}
        description={t.deleteDescription}
        confirmLabel={t.delete}
        destructive
        pending={pending}
        onConfirm={() =>
          new Promise<void>((resolve) =>
            startTransition(async () => {
              const r = await deleteProduct(productId).catch(() => null);
              resolve();
              setDeleteOpen(false);
              if (!r || !r.ok) toast.error(r?.message ?? m.actions.itemSaveFailed);
              else {
                toast.success(t.deleted);
                router.refresh();
              }
            }),
          )
        }
      />
      )}
    </>
  );
}

/** "Undo the sale": deletes the sale's order (existing order flow), so the item is back in stock. */
export function UndoSaleButton({ orderId, name }: { orderId: string; name: string }) {
  const m = resellerMessages[useLocale()];
  const t = m.items;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="icon" aria-label={`${t.undoSale} : ${name}`} title={t.undoSale}>
          <Undo2 />
        </Button>
      }
      title={t.undoTitle}
      description={t.undoDescription}
      confirmLabel={t.undoSale}
      destructive
      pending={pending}
      onConfirm={() =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const r = await deleteOrder(orderId).catch(() => null);
            resolve();
            setOpen(false);
            if (!r || !r.ok) toast.error(r?.message ?? m.actions.saleSaveFailed);
            else {
              toast.success(t.undone);
              router.refresh();
            }
          }),
        )
      }
    />
  );
}
