"use client";

import { Check, Circle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Checkbox } from "@/components/ui/controls";
import { Alert } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authErrorMessage, isEmailValid, isPasswordValid, passwordChecks } from "@/lib/auth/validation";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; terms?: string; form?: string }>({});
  const [pending, setPending] = useState(false);
  const checks = passwordChecks(password);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!isEmailValid(email.trim())) nextErrors.email = "Enter a valid email address.";
    if (!isPasswordValid(password)) nextErrors.password = "Your password does not meet the requirements below.";
    if (!accepted) nextErrors.terms = "Please accept the terms and privacy policy to continue.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setPending(true);
    const { error } = await getBrowserClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=/onboarding`,
        data: { full_name: name.trim().slice(0, 120) || undefined },
      },
    });
    if (error) {
      setPending(false);
      setErrors({ form: authErrorMessage(error) });
      return;
    }
    // For privacy, the response is the same whether or not the address already has an account.
    router.push(`/check-email?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {errors.form ? <Alert tone="negative">{errors.form}</Alert> : null}
      <Field htmlFor="name" label="Your name" optional>
        <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </Field>
      <Field htmlFor="email" label="Work email" error={errors.email}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? "email-error" : undefined}
          required
        />
      </Field>
      <Field htmlFor="password" label="Password" error={errors.password}>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby="password-rules"
          required
        />
      </Field>
      <ul id="password-rules" className="-mt-1 space-y-1 text-xs" aria-label="Password requirements">
        {checks.map((c) => (
          <li key={c.id} className={cn("flex items-center gap-1.5", c.ok ? "text-emerald-700" : "text-ink-3")}>
            {c.ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            {c.label}
            <span className="sr-only">{c.ok ? "(met)" : "(not met)"}</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1.5">
        <div className="flex items-start gap-2.5">
          <Checkbox id="terms" checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" aria-describedby={errors.terms ? "terms-error" : undefined} />
          <Label htmlFor="terms" className="font-normal text-ink-2">
            I accept the{" "}
            <Link href="/terms" className="font-medium text-emerald-700 hover:underline" target="_blank">
              terms of service
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" className="font-medium text-emerald-700 hover:underline" target="_blank">
              privacy policy
            </Link>
            .
          </Label>
        </div>
        {errors.terms ? (
          <p id="terms-error" role="alert" className="text-xs font-medium text-negative-700">
            {errors.terms}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="accent" className="w-full" size="lg" loading={pending}>
        Create account
      </Button>
      <p className="text-center text-xs text-ink-3">14 days free. No payment card required.</p>
    </form>
  );
}
