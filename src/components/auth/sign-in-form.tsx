"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/i18n/client";
import { authFormMessages } from "@/i18n/messages/auth-forms";
import { safeNextPath } from "@/lib/auth/redirect";
import { authErrorMessage, isEmailValid } from "@/lib/auth/validation";
import { getBrowserClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const t = authFormMessages[locale];
  const next = safeNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setUnconfirmed(false);
    if (!isEmailValid(email.trim())) return setError(t.invalidEmail);
    if (!password) return setError(t.signIn.enterPassword);
    setPending(true);
    const { error: signInError } = await getBrowserClient().auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setPending(false);
      setUnconfirmed(signInError.code === "email_not_confirmed");
      setError(authErrorMessage(signInError, locale));
      return;
    }
    router.replace(next as Route);
    router.refresh();
  }

  async function resendConfirmation() {
    const { error: resendError } = await getBrowserClient().auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding` },
    });
    if (resendError) setError(authErrorMessage(resendError, locale));
    else setResent(true);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {error ? (
        <Alert tone="negative">
          {error}
          {unconfirmed && !resent ? (
            <button type="button" onClick={resendConfirmation} className="mt-1 block font-medium underline">
              {t.signIn.resend}
            </button>
          ) : null}
        </Alert>
      ) : null}
      {resent ? <Alert tone="positive">{t.signIn.resent}</Alert> : null}
      <Field htmlFor="email" label={t.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </Field>
      <Field
        htmlFor="password"
        label={t.password}
        aside={
          <Link href="/forgot-password" className="text-xs font-medium text-emerald-700 hover:underline">
            {t.signIn.forgot}
          </Link>
        }
      >
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.signIn.submit}
      </Button>
    </form>
  );
}
