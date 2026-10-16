import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].resetPassword;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function ResetPasswordPage() {
  const t = authPageMessages[await getLocale()].resetPassword;
  return (
    <AuthCard title={t.title} description={t.description}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
