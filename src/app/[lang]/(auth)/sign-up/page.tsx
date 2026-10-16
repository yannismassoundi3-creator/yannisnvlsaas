import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { authPageMessages } from "@/i18n/messages/auth-pages";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = authPageMessages[await getLocale()].signUp;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default async function SignUpPage() {
  const t = authPageMessages[await getLocale()].signUp;
  return (
    <AuthCard
      title={t.title}
      description={t.description}
      footer={
        <>
          {t.haveAccount}{" "}
          <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
            {t.signIn}
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
