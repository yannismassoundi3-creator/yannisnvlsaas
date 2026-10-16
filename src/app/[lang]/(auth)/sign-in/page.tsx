import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].signIn;
  return { title: t.metaTitle, robots: { index: false } };
}

export default async function SignInPage() {
  const t = authPageMessages[await getLocale()].signIn;
  return (
    <AuthCard
      title={t.title}
      description={t.description}
      footer={
        <>
          {t.newTo}{" "}
          <Link href="/sign-up" className="font-medium text-emerald-700 hover:underline">
            {t.startTrial}
          </Link>
        </>
      }
    >
      <Suspense fallback={<div className="h-64" />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
