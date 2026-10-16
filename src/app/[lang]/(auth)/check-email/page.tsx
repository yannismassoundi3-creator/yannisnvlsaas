import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { ResendConfirmation } from "@/components/auth/password-forms";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].checkEmail;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function CheckEmailPage() {
  const m = authPageMessages[await getLocale()];
  const t = m.checkEmail;
  return (
    <AuthCard
      title={t.title}
      description={
        <span className="flex items-start gap-2">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          {t.description}
        </span>
      }
      footer={
        <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
          {m.backToSignIn}
        </Link>
      }
    >
      <Suspense fallback={null}>
        <ResendConfirmation />
      </Suspense>
      <p className="mt-5 text-xs text-ink-3">{t.noEmail}</p>
    </AuthCard>
  );
}
