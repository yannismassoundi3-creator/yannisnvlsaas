import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Start your free trial",
  description: "Create a Narixia account. 14 days free, no payment card required.",
};

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Understand your real margins in minutes."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-emerald-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
