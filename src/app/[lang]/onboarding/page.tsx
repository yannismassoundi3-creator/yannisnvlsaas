import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { Skeleton } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { getWorkspace } from "@/lib/auth/workspace";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false } };

async function Flow() {
  const ws = await getWorkspace();
  return <OnboardingFlow initialStep={ws.organization ? 2 : 0} defaultName={ws.user.fullName} />;
}

export default function OnboardingPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Narixia home">
            <Logo />
          </Link>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <Suspense
          fallback={
            <div className="grid gap-8 md:grid-cols-[220px_1fr]">
              <Skeleton className="h-40" />
              <Skeleton className="h-96" />
            </div>
          }
        >
          <Flow />
        </Suspense>
      </main>
    </div>
  );
}
