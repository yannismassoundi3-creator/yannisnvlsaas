import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { inboundConfig } from "@/lib/inbound/config";
import { parseInboundEmail, TOKEN_RE, tokenFromAddress } from "@/lib/inbound/parse";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Inbound email webhook (Postmark inbound JSON). Sellers forward their own
 * sale-notification emails to their store's private address; Postmark posts
 * each message here with HTTP basic auth (user "narixia", password
 * INBOUND_WEBHOOK_SECRET). Each message becomes a pending entry that the
 * seller confirms in the app; nothing is recorded as a sale automatically.
 *
 * - Credentials are compared in constant time; wrong or missing: 401.
 * - The body is capped at 5 MB (Postmark includes attachments as base64).
 * - The store is found by the token in MailboxHash ("…+TOKEN@…"), else in the
 *   To / OriginalRecipient addresses. An unknown token gets the same answer as
 *   a stored message, so the endpoint never reveals which tokens exist.
 * - Deliveries are idempotent per store (MessageID); retries store nothing new.
 * - Rate limited per store. Email content is never logged.
 *
 * Successful and unknown-token deliveries answer 200: Postmark retries any
 * other status (except 403), which would only repeat a delivery we accepted.
 */

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const PER_STORE_PER_HOUR = 120;
const ACCEPTED = { ok: true } as const;

const address = z.object({ Email: z.string().optional(), MailboxHash: z.string().optional() }).passthrough();
const payload = z
  .object({
    From: z.string().optional(),
    FromFull: address.optional(),
    To: z.string().optional(),
    ToFull: z.array(address).optional(),
    OriginalRecipient: z.string().optional(),
    MailboxHash: z.string().optional(),
    Subject: z.string().optional(),
    TextBody: z.string().optional(),
    HtmlBody: z.string().optional(),
    Date: z.string().optional(),
    MessageID: z.string().optional(),
  })
  .passthrough();

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Basic ${Buffer.from(`narixia:${secret}`).toString("base64")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Reads at most `limit` bytes; null when the body is larger. */
async function readBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function findToken(email: z.infer<typeof payload>): string | null {
  const hashes = [email.MailboxHash, ...(email.ToFull ?? []).map((t) => t.MailboxHash)];
  for (const hash of hashes) {
    const candidate = hash?.trim().toLowerCase();
    if (candidate && TOKEN_RE.test(candidate)) return candidate;
  }
  return tokenFromAddress(email.OriginalRecipient) ?? tokenFromAddress(email.To) ?? tokenFromAddress((email.ToFull ?? []).map((t) => t.Email ?? "").join(","));
}

const emailOnly = (value: string | null | undefined) => {
  if (!value) return null;
  const m = /[^\s<>"',;]+@[^\s<>"',;]+/.exec(value);
  return (m ? m[0] : value).slice(0, 320);
};

export async function POST(request: Request) {
  const config = inboundConfig();
  if (!config.enabled) return new Response("Inbound email is not configured", { status: 503 });
  if (!authorized(request, config.secret)) {
    return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="narixia-inbound"' } });
  }

  const raw = await readBody(request, MAX_BODY_BYTES);
  if (raw === null) return new Response("Payload too large", { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const parsedPayload = payload.safeParse(json);
  if (!parsedPayload.success) return new Response("Invalid payload", { status: 400 });
  const email = parsedPayload.data;

  const token = findToken(email);
  if (!token) return Response.json(ACCEPTED);

  const admin = createAdminClient();
  const { data: store, error: storeError } = await admin.from("stores").select("id, organization_id, currency").eq("inbound_token", token).maybeSingle();
  if (storeError) {
    console.error("[inbound] store lookup failed", { code: storeError.code });
    return new Response("Temporary failure", { status: 500 });
  }
  if (!store) return Response.json(ACCEPTED);

  if (!(await consumeRateLimit(`inbound:${store.id}`, PER_STORE_PER_HOUR, 3600))) {
    return new Response("Too many messages", { status: 429, headers: { "Retry-After": "3600" } });
  }

  const from = email.FromFull?.Email ?? email.From ?? "";
  const subject = (email.Subject ?? "").slice(0, 2000);
  const text = (email.TextBody ?? "").slice(0, 200_000);
  const html = (email.HtmlBody ?? "").slice(0, 500_000);
  const parsed = parseInboundEmail({ from, subject, text, html }, store.currency);
  const messageId =
    email.MessageID?.trim().slice(0, 300) ||
    `sha256:${createHash("sha256").update(`${from}\n${subject}\n${email.Date ?? ""}\n${text || html}`).digest("hex")}`;

  const { error } = await admin.from("inbound_emails").upsert(
    {
      organization_id: store.organization_id,
      store_id: store.id,
      message_id: messageId,
      from_address: emailOnly(parsed.originalFrom),
      subject: subject.slice(0, 500) || null,
      platform: parsed.platform,
      kind: parsed.kind,
      parsed_title: parsed.title,
      parsed_amount_minor: parsed.amountMinor,
      verification_code: parsed.verification?.code ?? null,
      verification_url: parsed.verification?.url?.slice(0, 1000) ?? null,
      text_excerpt: parsed.excerpt || null,
    },
    { onConflict: "store_id,message_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("[inbound] insert failed", { code: error.code });
    return new Response("Temporary failure", { status: 500 });
  }
  return Response.json(ACCEPTED);
}
