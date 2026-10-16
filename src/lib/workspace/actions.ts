"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ACTIVE_STORE_COOKIE, requireWorkspace } from "@/lib/auth/workspace";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function switchStore(storeId: string): Promise<{ ok: boolean }> {
  const ws = await requireWorkspace();
  const parsed = z.string().uuid().safeParse(storeId);
  if (!parsed.success || !ws.stores.some((s) => s.id === parsed.data)) return { ok: false };
  (await cookies()).set(ACTIVE_STORE_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  refresh();
  return { ok: true };
}

const feedbackSchema = z.object({
  kind: z.enum(["question", "bug", "idea", "other"]),
  message: z.string().trim().min(3, "Tell us a little more.").max(4000, "Please keep it under 4,000 characters."),
  page: z.string().max(200).optional(),
});

export async function sendFeedback(input: z.input<typeof feedbackSchema>): Promise<{ ok: true } | { ok: false; message: string }> {
  const ws = await requireWorkspace();
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check your message." };
  if (!(await consumeRateLimit(`feedback:${ws.user.id}`, 10, 3600))) {
    return { ok: false, message: "You have sent a lot of messages recently. Please try again later." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({
    organization_id: ws.organization.id,
    user_id: ws.user.id,
    kind: parsed.data.kind,
    message: parsed.data.message,
    page: parsed.data.page ?? null,
  });
  if (error) return { ok: false, message: "We could not send your message. Please try again." };
  return { ok: true };
}
