import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Shown inside the application shell for unknown records (e.g. a deleted product or another store's order). */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-line bg-surface px-6 py-10 text-center shadow-xs">
      <h1 className="text-lg font-semibold text-ink">Not found</h1>
      <p className="mt-2 text-sm text-ink-3">
        This record does not exist in the selected store. It may have been deleted, or it belongs to another store: switch stores from the sidebar.
      </p>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" asChild>
          <Link href="/app">Go to overview</Link>
        </Button>
      </div>
    </div>
  );
}
