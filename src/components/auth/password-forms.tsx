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
import { authErrorMessage, isEmailValid, isPasswordValid, passwordChecks } from "@/lib/auth/validation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isEmailValid(email.trim())) return setError("Enter a valid email address.");
    setPending(true);
    const { error: resetError } = await getBrowserClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/confirm?next=/reset-password`,
    });
    setPending(false);
    // Rate-limit errors are shown; everything else gets the same neutral confirmation.
    if (resetError && (resetError.status === 429 || resetError.code?.startsWith("over_"))) {
      return setError(authErrorMessage(resetError));
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="positive" title="Check your email">
        If an account exists for {email.trim()}, we have sent a link to choose a new password. The link expires in one
        hour.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="negative">{error}</Alert> : null}
      <Field htmlFor="email" label="Email">
        <Input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Send reset link
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const checks = passwordChecks(password);

  useEffect(() => {
    getBrowserClient()
      .auth.getUser()
      .then(({ data }) => setReady(data.user ? "ok" : "no-session"));
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isPasswordValid(password)) return setError("Your password does not meet the requirements.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setPending(true);
    const { error: updateError } = await getBrowserClient().auth.updateUser({ password });
    if (updateError) {
      setPending(false);
      return setError(authErrorMessage(updateError));
    }
    toast.success("Your password has been updated.");
    router.replace("/app");
    router.refresh();
  }

  if (ready === "checking") return <p className="text-sm text-ink-3">Checking your reset link…</p>;
  if (ready === "no-session") {
    return (
      <Alert tone="caution" title="This reset link is no longer valid">
        Links expire after one hour and can be used once. <Link href="/forgot-password">Request a new link</Link>.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? <Alert tone="negative">{error}</Alert> : null}
      <Field htmlFor="password" label="New password">
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
      <Field htmlFor="confirm" label="Confirm new password">
        <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        Update password
      </Button>
    </form>
  );
}

export function ResendConfirmation() {
  const params = useSearchParams();
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
      setMessage(authErrorMessage(error));
    } else setState("sent");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-2">
        We sent a confirmation link to <strong className="font-medium text-ink">{email}</strong>.
      </p>
      {state === "sent" ? <Alert tone="positive">A new confirmation email is on its way.</Alert> : null}
      {state === "error" && message ? <Alert tone="negative">{message}</Alert> : null}
      <Button variant="secondary" onClick={resend} loading={state === "sending"} disabled={state === "sent"}>
        Send it again
      </Button>
    </div>
  );
}
