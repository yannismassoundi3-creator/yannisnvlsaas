"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { useLocale } from "@/i18n/client";
import { authFormMessages } from "@/i18n/messages/auth-forms";
import { safeNextPath } from "@/lib/auth/redirect";
import { authErrorMessage, isEmailValid } from "@/lib/auth/validation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { CodeInput, codeErrorMessage, isCodeComplete } from "./email-code";

type Mode = "password" | "code";

/** Sign-in with email and password, or with a 6-digit code sent by email. */
export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const locale = useLocale();
  const t = authFormMessages[locale];
  const next = safeNextPath(params.get("next"));
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [pending, setPending] = useState(false);

  function switchMode(to: Mode) {
    setMode(to);
    setError(null);
    setNotice(null);
    setUnconfirmed(false);
    setCodeSent(false);
    setCode("");
  }

  /** Removes a validation message shown on submit once the field it was about is valid. */
  function clearIfFixed(message: string, valid: boolean) {
    if (valid) setError((current) => (current === message ? null : current));
  }

  function signedIn() {
    router.replace(next as Route);
    router.refresh();
  }

  async function onPasswordSubmit(event: FormEvent) {
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
    signedIn();
  }

  async function sendCode(isResend = false) {
    setError(null);
    setNotice(null);
    if (!isEmailValid(email.trim())) return setError(t.invalidEmail);
    setPending(true);
    // Only existing accounts get a code: new accounts go through sign-up and its terms.
    const { error: otpError } = await getBrowserClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
    setPending(false);
    // Unknown addresses are answered like known ones, so the form does not reveal who has an account.
    if (otpError && otpError.code !== "otp_disabled" && otpError.code !== "user_not_found") return setError(authErrorMessage(otpError, locale));
    setCodeSent(true);
    setCode("");
    setNotice(isResend ? t.code.resent : t.code.sentTo(email.trim()));
  }

  async function onCodeSubmit(event: FormEvent) {
    event.preventDefault();
    if (!codeSent) return sendCode();
    setError(null);
    if (!isCodeComplete(code)) return setError(t.code.enterCode);
    setPending(true);
    const { error: verifyError } = await getBrowserClient().auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
    if (verifyError) {
      setPending(false);
      setError(codeErrorMessage(verifyError, locale));
      return;
    }
    signedIn();
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

  const emailField = (
    <Field htmlFor="email" label={t.email}>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          clearIfFixed(t.invalidEmail, isEmailValid(e.target.value.trim()));
        }}
        readOnly={mode === "code" && codeSent}
        required
        autoFocus
      />
    </Field>
  );

  const alerts = (
    <>
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
      {notice ? <Alert tone="positive">{notice}</Alert> : null}
    </>
  );

  if (mode === "code") {
    return (
      <form onSubmit={onCodeSubmit} noValidate className="space-y-4">
        {alerts}
        {!codeSent ? <p className="text-sm text-ink-2">{t.code.intro}</p> : null}
        {emailField}
        {codeSent ? (
          <Field htmlFor="code" label={t.code.label}>
            <CodeInput
              id="code"
              value={code}
              onValueChange={(value) => {
                setCode(value);
                clearIfFixed(t.code.enterCode, isCodeComplete(value));
              }}
              required
              autoFocus
            />
          </Field>
        ) : null}
        <Button type="submit" className="w-full" size="lg" loading={pending}>
          {codeSent ? t.code.submit : t.code.send}
        </Button>
        <div className="flex flex-col items-center gap-2 text-sm">
          {codeSent ? (
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              <button type="button" onClick={() => sendCode(true)} disabled={pending} className="font-medium text-emerald-700 hover:underline">
                {t.code.resend}
              </button>
              <button type="button" onClick={() => switchMode("code")} className="font-medium text-emerald-700 hover:underline">
                {t.code.changeEmail}
              </button>
            </div>
          ) : null}
          <button type="button" onClick={() => switchMode("password")} className="font-medium text-ink-2 hover:text-ink hover:underline">
            {t.code.usePassword}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onPasswordSubmit} noValidate className="space-y-4">
      {alerts}
      {emailField}
      <Field
        htmlFor="password"
        label={t.password}
        aside={
          <Link href="/forgot-password" className="text-xs font-medium text-emerald-700 hover:underline">
            {t.signIn.forgot}
          </Link>
        }
      >
        <PasswordInput
          id="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearIfFixed(t.signIn.enterPassword, e.target.value !== "");
          }}
          required
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={pending}>
        {t.signIn.submit}
      </Button>
      <p className="text-center text-sm">
        <button type="button" onClick={() => switchMode("code")} className="font-medium text-emerald-700 hover:underline">
          {t.code.useCode}
        </button>
      </p>
    </form>
  );
}
