"use client";

import { CheckCircle2, Play, RotateCcw, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";
import { useFormat, useLocale } from "@/i18n/client";
import { importUi } from "@/i18n/messages/imports-ui";
import { cancelImport, commitImportBatch, deleteImportRecord, rollbackImport } from "@/lib/imports/actions";

type Props = {
  jobId: string;
  status: string;
  validRows: number;
  canUndo: boolean;
  canWrite: boolean;
};

export function ImportJobActions({ jobId, status, validRows, canUndo, canWrite }: Props) {
  const router = useRouter();
  const t = importUi[useLocale()].jobActions;
  const f = useFormat();
  const [committing, setCommitting] = useState<{ remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [undoOpen, setUndoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function confirm() {
    setError(null);
    setCommitting({ remaining: validRows });
    for (let i = 0; i < 10_000; i++) {
      const result = await commitImportBatch(jobId).catch(() => null);
      if (!result) {
        setCommitting(null);
        setError(t.interrupted);
        return;
      }
      if (!result.ok) {
        setCommitting(null);
        setError(result.message);
        router.refresh();
        return;
      }
      if (result.done) break;
      setCommitting({ remaining: result.remaining });
    }
    setCommitting(null);
    toast.success(t.complete);
    router.refresh();
  }

  const done = validRows - (committing?.remaining ?? validRows);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "validated" ? (
          <>
            <Button onClick={() => void confirm()} loading={Boolean(committing)} disabled={validRows === 0 || !canWrite}>
              <CheckCircle2 aria-hidden />
              {t.importRows(f.count(validRows), validRows)}
            </Button>
            <Button
              variant="ghost"
              disabled={Boolean(committing) || pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await cancelImport(jobId);
                  if (!r.ok) toast.error(r.message);
                  else router.refresh();
                })
              }
            >
              <X aria-hidden />
              {t.cancel}
            </Button>
          </>
        ) : null}
        {status === "committing" ? (
          <Button onClick={() => void confirm()} loading={Boolean(committing)} disabled={!canWrite}>
            <Play aria-hidden />
            {t.resume}
          </Button>
        ) : null}
        {status === "staging" ? (
          <Button
            variant="secondary"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await cancelImport(jobId);
                if (!r.ok) toast.error(r.message);
                else router.refresh();
              })
            }
          >
            {t.cancelUpload}
          </Button>
        ) : null}
        {status === "committed" ? (
          <ConfirmDialog
            open={undoOpen}
            onOpenChange={setUndoOpen}
            trigger={
              <Button variant="secondary" disabled={!canUndo}>
                <RotateCcw aria-hidden />
                {t.undo}
              </Button>
            }
            title={t.undoTitle}
            description={t.undoDescription}
            confirmLabel={t.undo}
            destructive
            pending={pending}
            onConfirm={() =>
              new Promise<void>((resolve) =>
                startTransition(async () => {
                  const r = await rollbackImport(jobId);
                  resolve();
                  setUndoOpen(false);
                  if (!r.ok) toast.error(r.message);
                  else {
                    toast.success(t.undone(f.count(r.removed), f.count(r.restored)));
                    router.refresh();
                  }
                }),
              )
            }
          />
        ) : null}
        {status !== "committing" && status !== "staging" && status !== "validated" ? (
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            trigger={
              <Button variant="danger-ghost">
                <Trash2 aria-hidden />
                {t.remove}
              </Button>
            }
            title={t.removeTitle}
            description={status === "committed" ? t.removeCommitted : t.removeOther}
            confirmLabel={t.removeConfirm}
            destructive
            pending={pending}
            onConfirm={() =>
              new Promise<void>((resolve) =>
                startTransition(async () => {
                  const r = await deleteImportRecord(jobId);
                  resolve();
                  setDeleteOpen(false);
                  if (!r.ok) toast.error(r.message);
                  else router.push("/app/imports");
                }),
              )
            }
          />
        ) : null}
      </div>
      {status === "committed" && !canUndo ? (
        <p className="text-sm text-ink-3">{t.onlyLatest}</p>
      ) : null}
      {committing ? (
        <div className="max-w-md space-y-1.5" aria-live="polite">
          <div className="flex justify-between text-sm text-ink-2">
            <span>{t.importing}</span>
            <span className="tabular">
              {f.count(done)} / {f.count(validRows)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${validRows ? (done / validRows) * 100 : 0}%` }} />
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-negative-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
