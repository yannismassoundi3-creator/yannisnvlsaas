import "server-only";
import { after } from "next/server";

/**
 * Runs background work after the response is sent. Outside a request (scripts,
 * tests) `after` is unavailable, so the work starts immediately instead.
 */
export function runAfter(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch(() => undefined);
  }
}
