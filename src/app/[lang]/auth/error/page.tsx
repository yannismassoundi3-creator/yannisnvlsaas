import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Link problem", robots: { index: false } };

const MESSAGES: Record<string, { title: string; body: string }> = {
  expired: { title: "This link has expired", body: "Email links work once and expire after one hour. Request a new one below." },
  invalid: { title: "This link is not valid", body: "It may have been used already, or copied incompletely. Request a new one below." },
  missing: { title: "Something is missing from this link", body: "Open the link directly from the email, or request a new one." },
};

async function Message({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const m = MESSAGES[reason ?? ""] ?? MESSAGES.invalid;
  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{m.title}</h1>
      <p className="mt-2 text-sm text-ink-2">{m.body}</p>
    </>
  );
}

export default function AuthErrorPage(props: PageProps<"/[lang]/auth/error">) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-16">
      <Link href="/" aria-label="Narixia home">
        <Logo />
      </Link>
      <div className="mt-10 w-full max-w-[400px] rounded-lg border border-line bg-surface p-7 shadow-sm">
        <Suspense fallback={<div className="h-14" />}>
          <Message searchParams={props.searchParams as Promise<{ reason?: string }>} />
        </Suspense>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/forgot-password">Reset my password</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
