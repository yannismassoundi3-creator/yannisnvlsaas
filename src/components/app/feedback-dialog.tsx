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
import { sendFeedback } from "@/lib/workspace/actions";

export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<"question" | "bug" | "idea" | "other">("question");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await sendFeedback({ kind, message, page: pathname });
      if (!result.ok) return setError(result.message);
      toast.success("Thanks — your message has been sent.");
      setMessage("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Help & feedback"
        description="Ask a question, report a problem or suggest an improvement. Please do not include passwords or payment details."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending}>
              Send
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert tone="negative">{error}</Alert> : null}
          <Field htmlFor="feedback-kind" label="Topic">
            <NativeSelect id="feedback-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="question">A question</option>
              <option value="bug">Something is not working</option>
              <option value="idea">An idea</option>
              <option value="other">Something else</option>
            </NativeSelect>
          </Field>
          <Field htmlFor="feedback-message" label="Message">
            <Textarea id="feedback-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} rows={5} />
          </Field>
          <p className="text-xs text-ink-3">
            Looking for definitions? See the <Link href="/glossary" className="font-medium text-emerald-700 hover:underline">metric glossary</Link>.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
