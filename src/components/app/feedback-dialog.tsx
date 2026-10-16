"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/field";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useLocale } from "@/i18n/client";
import { shellMenus } from "@/i18n/messages/shell-menus";
import { localizedPath } from "@/i18n/config";
import { sendFeedback } from "@/lib/workspace/actions";

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = shellMenus[locale].feedback;
  const [kind, setKind] = useState<"question" | "bug" | "idea" | "other">("question");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await sendFeedback({ kind, message, page: pathname });
      if (!result.ok) return setError(result.message);
      toast.success(t.sent);
      setMessage("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={t.title}
        description={t.description}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              {t.cancel}
            </Button>
            <Button onClick={submit} loading={pending}>
              {t.send}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="negative">{error}</Alert> : null}
          <Field htmlFor="feedback-kind" label={t.topic}>
            <NativeSelect id="feedback-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="question">{t.kinds.question}</option>
              <option value="bug">{t.kinds.bug}</option>
              <option value="idea">{t.kinds.idea}</option>
              <option value="other">{t.kinds.other}</option>
            </NativeSelect>
          </Field>
          <Field htmlFor="feedback-message" label={t.message}>
            <Textarea id="feedback-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={5} />
          </Field>
          <p className="text-xs text-ink-3">
            {t.glossaryBefore}
            <Link href={localizedPath("/glossary", locale)} className="font-medium text-emerald-700 hover:underline">
              {t.glossaryLink}
            </Link>
            {t.glossaryAfter}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
