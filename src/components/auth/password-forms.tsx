"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { useLocale } from "@/i18n/client";
import { authFormMessages } from "@/i18n/messages/auth-forms";
import { authErrorMessage, isEmailValid, isPasswordValid, passwordChecks } from "@/lib/auth/validation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm() {
  const locale = useLocale();
  const t = authFormMessages[locale];
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isEmailValid(email.trim())) return setError(t.invalidEmail);
    setPending(true);
    const { error: resetError } = await getBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setPending(false);
    // Rate-limit errors are shown; everything else gets the same neutral confirmation.
    if (resetError && (resetError.status === 429 || resetError.code?.startsWith("over_"))) {
      return setError(authErrorMessage(resetError, locale));
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="positive" title={t.forgot.sentTitle}>
        {t.forgot.sentBody(email.trim())}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="negative">{error}</Alert> : null}
      <Field htmlFor="email" label={t.email}>
        <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.forgot.submit}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = authFormMessages[locale].reset;
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const checks = passwordChecks(password, locale);

  useEffect(() => {
    getBrowserClient()
      .auth.getUser()
      .then(({ data }) => setReady(data.user ? "ok" : "no-session"));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isPasswordValid(password)) return setError(t.passwordInvalid);
    if (password !== confirm) return setError(t.mismatch);
    setPending(true);
    const { error: updateError } = await getBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      return setError(authErrorMessage(updateError, locale));
    }
    toast.success(t.updated);
    router.replace("/app");
    router.refresh();
  }

  if (ready === "checking") return <p className="text-sm text-ink-3">{t.checking}</p>;
  if (ready === "no-session") {
    return (
      <Alert tone="caution" title={t.expiredTitle}>
        {t.expiredBody} <Link href="/forgot-password">{t.requestNew}</Link>.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="negative">{error}</Alert> : null}
      <Field htmlFor="password" label={t.newPassword}>
        <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="password-rules" required autoFocus />
      </Field>
      <ul id="password-rules" className="-mt-1 space-y-1 text-xs">
        {checks.map((c) => (
          <li key={c.id} className={cn("flex items-center gap-1.5", c.ok ? "text-emerald-700" : "text-ink-3")}>
            {c.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            {c.label}
          </li>
        ))}
      </ul>
      <Field htmlFor="confirm" label={t.confirmPassword}>
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.submit}
      </Button>
    </form>
  );
}

export function ResendConfirmation() {
  const params = useSearchParams();
  const locale = useLocale();
  const t = authFormMessages[locale].resend;
  const email = params.get("email") ?? "";
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  if (!email) return null;

  async function resend() {
    setState("sending");
    const { error } = await getBrowserClient().auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    });
    if (error) {
      setState("error");
      setMessage(authErrorMessage(error, locale));
    } else setState("sent");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        {t.sentTo} <strong className="font-medium text-ink">{email}</strong>
        {t.sentToSuffix}
      </p>
      {state === "sent" ? <Alert tone="positive">{t.sent}</Alert> : null}
      {state === "error" && message ? <Alert tone="negative">{message}</Alert> : null}
      <Button variant="secondary" onClick={resend} loading={state === "sending"} disabled={state === "sent"}>
        {t.submit}
      </Button>
    </div>
  );
}
