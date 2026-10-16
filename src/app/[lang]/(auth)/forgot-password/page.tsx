import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].forgotPassword;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function ForgotPasswordPage() {
  const m = authPageMessages[await getLocale()];
  const t = m.forgotPassword;
  return (
    <AuthCard
      title={t.title}
      description={t.description}
      footer={
        <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
          {m.backToSignIn}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
