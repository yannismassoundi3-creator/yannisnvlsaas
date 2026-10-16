import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <AuthCard
      title="Sign in to Narixia"
      description="Welcome back. See how your store is doing."
      footer={
        <>
          New to Narixia?{" "}
          <Link href="/sign-up" className="font-medium text-emerald-700 hover:underline">
            Start your free trial
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
