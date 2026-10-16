import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center px-4 pt-16">
      <Link href="/" aria-label="Narixia home">
        <Logo />
      </Link>
      <main className="mt-10 w-full max-w-[400px] rounded-lg border border-line bg-surface p-7 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-2">The address may be mistyped, or the page has moved.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Button asChild>
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/app">Open the dashboard</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
