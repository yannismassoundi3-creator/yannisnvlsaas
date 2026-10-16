"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { shellMenus } from "@/i18n/messages/shell-menus";
import { getRequestLocale } from "@/i18n/request";
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

type FeedbackMessages = (typeof shellMenus)["en"]["feedback"];

function feedbackSchema(t: FeedbackMessages) {
  return z.object({
    kind: z.enum(["question", "bug", "idea", "other"]),
    message: z.string().trim().min(3, t.tooShort).max(4000, t.tooLong),
    page: z.string().max(200).optional(),
  });
}

export async function sendFeedback(input: z.input<ReturnType<typeof feedbackSchema>>): Promise<{ ok: true } | { ok: false; message: string }> {
  const ws = await requireWorkspace();
  const t = shellMenus[await getRequestLocale()].feedback;
  const parsed = feedbackSchema(t).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? t.invalid };
  if (!(await consumeRateLimit(`feedback:${ws.user.id}`, 10, 3600))) {
    return { ok: false, message: t.rateLimited };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("feedback").insert({
    organization_id: ws.organization.id,
    user_id: ws.user.id,
    kind: parsed.data.kind,
    message: parsed.data.message,
    page: parsed.data.page ?? null,
  });
  if (error) return { ok: false, message: t.failed };
  return { ok: true };
}
