import { detectDecimalSeparator } from "@/lib/finance/decimal";
import { parseAmountToMinor } from "@/lib/finance/money";

/**
 * Sale-notification emails forwarded by sellers (pure, no I/O).
 *
 * We have no real sample of Vinted, Leboncoin, eBay or Vestiaire Collective
 * emails yet, so nothing here pretends to know their exact format. The parser
 * guesses, and every email becomes a pending entry that the seller confirms:
 * - the platform, from the original sender's domain, else from the text;
 * - the most likely sale amount: euro amounts ("18,50 €", "€18.50", "18 €"),
 *   preferring those next to words such as vendu, sold, total, montant, prix,
 *   payé, earned or gagné, and avoiding fees and shipping;
 * - a title: a quoted article name, else the subject without boilerplate;
 * - Gmail's forwarding-verification emails, whose link and code the seller
 *   needs to finish setting up forwarding.
 * Forwarded-message wrappers (Gmail, Outlook, Apple Mail, in English and French)
 * are unwrapped first. The excerpt drops email addresses, phone numbers and
 * lines that look like postal addresses: buyers' details are not needed.
 */

export type ResalePlatform = "vinted" | "leboncoin" | "ebay" | "vestiaire_collective";
export type InboundKind = "sale" | "gmail_verification" | "other";

export type InboundEmailContent = {
  from: string;
  subject: string;
  text: string;
  html: string;
};

export type ParsedInboundEmail = {
  kind: InboundKind;
  platform: ResalePlatform | null;
  /** In minor units of `currency`; null when no amount was found (or the store does not use euros). */
  amountMinor: number | null;
  title: string | null;
  excerpt: string;
  verification: { code: string | null; url: string | null } | null;
  forwarded: boolean;
  /** Sender of the original message when the email was forwarded, else the sender. */
  originalFrom: string;
};

export const EXCERPT_MAX = 2000;
const TITLE_MAX = 200;

// -----------------------------------------------------------------------------
// HTML to text
// -----------------------------------------------------------------------------
const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", euro: "€", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", hellip: "…", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç", ecirc: "ê", ocirc: "ô", ucirc: "û", icirc: "î" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Readable text of an HTML email body: block elements become line breaks, tags and scripts are dropped. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// -----------------------------------------------------------------------------
// Forwarded messages
// -----------------------------------------------------------------------------
const FORWARD_MARKERS = [
  /-{2,}\s*Forwarded message\s*-{2,}/i,
  /-{2,}\s*Message transf[ée]r[ée]\s*-{2,}/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  /-{2,}\s*Message d'origine\s*-{2,}/i,
  /-{2,}\s*Message original\s*-{2,}/i,
  /D[ée]but du message r[ée]exp[ée]di[ée]\s*:/i,
  /Begin forwarded message\s*:/i,
];

const HEADER_LINE = /^\s*(From|De|Date|Envoy[ée]|Sent|Subject|Objet|Sujet|To|[ÀA]|Cc|Reply-To|R[ée]pondre [àa])\s*:\s*(.*)$/i;

/** The forwarded message inside a forward wrapper, with its original sender and subject when present. */
export function unwrapForwarded(text: string): { forwarded: boolean; from: string | null; subject: string | null; body: string } {
  let start = -1;
  let markerLength = 0;
  for (const marker of FORWARD_MARKERS) {
    const m = marker.exec(text);
    if (m && (start === -1 || m.index < start)) {
      start = m.index;
      markerLength = m[0].length;
    }
  }
  if (start === -1) return { forwarded: false, from: null, subject: null, body: text };
  const lines = text.slice(start + markerLength).split("\n");
  let from: string | null = null;
  let subject: string | null = null;
  let i = 0;
  // Skip blank lines, then read the header block ("From: …", "Objet : …").
  while (i < lines.length && lines[i].trim() === "") i++;
  while (i < lines.length) {
    const header = HEADER_LINE.exec(lines[i]);
    if (!header) break;
    const name = header[1].toLowerCase();
    if (name === "from" || name === "de") from = header[2].trim();
    if (name === "subject" || name === "objet" || name === "sujet") subject = header[2].trim();
    i++;
  }
  return { forwarded: true, from, subject, body: lines.slice(i).join("\n").trim() };
}

// -----------------------------------------------------------------------------
// Platform
// -----------------------------------------------------------------------------
const PLATFORM_DOMAINS: [ResalePlatform, RegExp][] = [
  ["vinted", /(^|[.@])vinted\.[a-z.]+/i],
  ["leboncoin", /(^|[.@])leboncoin\.[a-z.]+/i],
  ["ebay", /(^|[.@])ebay\.[a-z.]+/i],
  ["vestiaire_collective", /(^|[.@])vestiairecollective\.[a-z.]+/i],
];

const PLATFORM_WORDS: [ResalePlatform, RegExp][] = [
  ["vinted", /\bvinted\b/i],
  ["leboncoin", /\ble\s?bon\s?coin\b/i],
  ["ebay", /\bebay\b/i],
  ["vestiaire_collective", /\bvestiaire\s?collective\b/i],
];

export function detectPlatform(senders: (string | null | undefined)[], text: string): ResalePlatform | null {
  for (const sender of senders) {
    if (!sender) continue;
    for (const [platform, re] of PLATFORM_DOMAINS) if (re.test(sender)) return platform;
  }
  for (const [platform, re] of PLATFORM_WORDS) if (re.test(text)) return platform;
  return null;
}

// -----------------------------------------------------------------------------
// Amounts
// -----------------------------------------------------------------------------
const NUMBER = String.raw`\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const AMOUNT_AFTER = new RegExp(String.raw`(?<![\d.,])(${NUMBER})\s?(?:€|EUR\b|euros?\b)`, "gi");
const AMOUNT_BEFORE = new RegExp(String.raw`(?:€|EUR)\s?(${NUMBER})(?![\d])`, "gi");

const PREFER = /\b(vendu|vendue|vente|sold|sale|total|montant|prix|price|pay[ée]e?|paid|earned|gagn[ée]|re[çc]u|received|recevr\w*|vers[ée]|transf[ée]r[ée]|revenus?|payout|amount)\b/i;
const AVOID = /\b(frais|fee|fees|port|livraison|shipping|protection|commission|envoi|postage|remise|discount|r[ée]duction)\b/i;

export type AmountCandidate = { minor: number; index: number; score: number };

/** Every euro amount in the text with a score: higher is more likely the sale amount. */
export function amountCandidates(text: string, currency = "EUR"): AmountCandidate[] {
  const found = new Map<number, AmountCandidate>();
  for (const re of [AMOUNT_AFTER, AMOUNT_BEFORE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const raw = m[1].replace(/[\s\u00a0\u202f]/g, "");
      const parsed = parseAmountToMinor(raw, currency, { decimalSeparator: detectDecimalSeparator([raw]) });
      if (!parsed.ok || parsed.value <= 0) continue;
      const index = m.index ?? 0;
      const before = text.slice(Math.max(0, index - 60), index);
      const lineStart = text.lastIndexOf("\n", index) + 1;
      const lineEnd = text.indexOf("\n", index);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      let score = 0;
      if (PREFER.test(before) || PREFER.test(line)) score += 3;
      if (AVOID.test(line)) score -= 4;
      if (!found.has(index)) found.set(index, { minor: parsed.value, index, score });
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

/** The most likely sale amount: best score, then the first one in the text. */
export function guessAmount(text: string, currency = "EUR"): number | null {
  const candidates = amountCandidates(text, currency);
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) if (c.score > best.score) best = c;
  return best.score < 0 ? null : best.minor;
}

// -----------------------------------------------------------------------------
// Title
// -----------------------------------------------------------------------------
const QUOTED = /[«“"]\s*([^«»“”"\n]{3,200}?)\s*[»”"]/;
const ITEM_LINE = /^\s*(?:Article|Item|Objet vendu|Produit|Annonce|Titre)\s*:\s*(.{3,200})$/im;
const SUBJECT_PREFIX = /^\s*((?:re|fwd?|tr|fw|wg)\s*:\s*)+/i;
const BOILERPLATE = [
  /\b(bonne nouvelle|f[ée]licitations|congratulations|good news|great news)\b\s*[!,.:]*/gi,
  /\b(votre|ton|your)\s+(article|annonce|item|objet)\b/gi,
  /\b(a|as|has|have|est)\s+(été|ete|been)\s+(vendu|vendue|sold|achet[ée]e?|purchased|bought)\b/gi,
  /\b(vous avez|tu as|you have|you've|you)\s+(vendu|sold)\b/gi,
  /\b(vendu|vendue|sold|nouvelle vente|new sale|commande|order|vente)\b\s*[!:.-]*/gi,
  /\b(sur|on)\s+(vinted|leboncoin|ebay|vestiaire collective)\b/gi,
  /[!:–—-]+\s*$/g,
];

function cleanTitle(value: string): string | null {
  const t = value
    .replace(/\s+/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    // A preposition left dangling once an amount was removed ("… for €45.00").
    .replace(/\s+(for|pour|à|at|de)$/i, "")
    .trim();
  return t.length >= 3 ? t.slice(0, TITLE_MAX) : null;
}

/** A quoted article name ("« Veste en jean » a été vendu"), an "Article : …" line, else the subject without boilerplate. */
export function guessTitle(subject: string, body: string): string | null {
  for (const source of [subject, body.slice(0, 3000)]) {
    const q = QUOTED.exec(source);
    if (q) {
      const t = cleanTitle(q[1]);
      if (t) return t;
    }
  }
  const line = ITEM_LINE.exec(body.slice(0, 3000));
  if (line) {
    const t = cleanTitle(line[1]);
    if (t) return t;
  }
  let s = subject.replace(SUBJECT_PREFIX, "");
  for (const re of BOILERPLATE) s = s.replace(re, " ");
  // Amounts are not part of an article name.
  s = s.replace(new RegExp(String.raw`(?:€|EUR)?\s?(?:${NUMBER})\s?(?:€|EUR|euros?)?`, "gi"), (m) => (/[€]|EUR|euro/i.test(m) ? " " : m));
  return cleanTitle(s);
}

// -----------------------------------------------------------------------------
// Gmail forwarding verification
// -----------------------------------------------------------------------------
export function isGmailVerification(from: string, subject: string): boolean {
  return /forwarding-noreply@google\.com/i.test(from) || /gmail forwarding confirmation|confirmation de transfert gmail/i.test(subject);
}

export function gmailVerification(subject: string, text: string): { code: string | null; url: string | null } {
  const url = /https:\/\/(?:mail-settings|mail|isolated\.mail)\.google\.com\/mail\/[^\s<>"')\]]+/i.exec(text)?.[0] ?? null;
  const code =
    /(?:confirmation code|code de confirmation|code de validation)\s*:?\s*(\d{6,12})/i.exec(text)?.[1] ??
    /\(#(\d{6,12})\)/.exec(subject)?.[1] ??
    /\b(\d{9})\b/.exec(text)?.[1] ??
    null;
  return { code, url };
}

// -----------------------------------------------------------------------------
// Excerpt
// -----------------------------------------------------------------------------
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{1,4}\)?[\s.-]?){3,5}\d{2,4}/g;
// "12 rue des Lilas", "75011 Paris", "Adresse de livraison : …"
const ADDRESS_LINE = /(\b\d{1,4}\s?(bis|ter)?,?\s+(rue|avenue|av\.|boulevard|bd|chemin|allée|impasse|place|route|quai|cours|street|st\.|road|rd\.|lane)\b)|(^\s*\d{5}\s+\p{L}[\p{L}\s'-]{1,40}$)|(\b(adresse|address|livr[ée] [àa]|ship(ping)? to|deliver(y|ed)? to)\b)/iu;

/** Text kept for the seller to check the entry: no email addresses, phone numbers or postal-address lines; 2,000 characters at most. */
export function makeExcerpt(body: string): string {
  const kept = body
    .split("\n")
    .filter((line) => !ADDRESS_LINE.test(line))
    .join("\n")
    .replace(EMAIL, "[e-mail]")
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 9 ? "[tél.]" : m))
    .replace(/https?:\/\/\S{60,}/g, (m) => `${m.slice(0, 40)}…`)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return kept.length > EXCERPT_MAX ? `${kept.slice(0, EXCERPT_MAX - 1)}…` : kept;
}

// -----------------------------------------------------------------------------
// Everything
// -----------------------------------------------------------------------------
const SALE_WORDS = /\b(vendu|vendue|vente|sold|sale|achet[ée]|purchased|commande|order|paiement|payment|payé|paid)\b/i;

/** Parses a forwarded sale email. `currency`: the store's; amounts are read only for euro stores. */
export function parseInboundEmail(email: InboundEmailContent, currency = "EUR"): ParsedInboundEmail {
  const fullText = (email.text && email.text.trim() ? email.text : htmlToText(email.html || "")).replace(/\r\n?/g, "\n");
  const subject = (email.subject || "").replace(/\s+/g, " ").trim();

  if (isGmailVerification(email.from, subject)) {
    return {
      kind: "gmail_verification",
      platform: null,
      amountMinor: null,
      title: null,
      excerpt: makeExcerpt(fullText),
      verification: gmailVerification(subject, fullText + "\n" + htmlToText(email.html || "") + "\n" + (email.html || "")),
      forwarded: false,
      originalFrom: email.from,
    };
  }

  const unwrapped = unwrapForwarded(fullText);
  const body = unwrapped.body;
  const originalSubject = unwrapped.subject ? unwrapped.subject.replace(SUBJECT_PREFIX, "") : subject.replace(SUBJECT_PREFIX, "");
  const originalFrom = unwrapped.from ?? email.from;
  const platform = detectPlatform([unwrapped.from, email.from], `${originalSubject}\n${body}`);
  const amountMinor = currency === "EUR" ? (guessAmount(originalSubject) ?? guessAmount(body)) : null;
  const kind: InboundKind = platform || SALE_WORDS.test(`${originalSubject}\n${body}`) ? "sale" : "other";
  return {
    kind,
    platform,
    amountMinor,
    title: guessTitle(originalSubject, body),
    excerpt: makeExcerpt(body),
    verification: null,
    forwarded: unwrapped.forwarded,
    originalFrom,
  };
}

// -----------------------------------------------------------------------------
// Inbound address and token
// -----------------------------------------------------------------------------
export const TOKEN_RE = /^[a-z0-9]{20,64}$/;

/** The store token of an inbound address: "abc123+TOKEN@inbound.postmarkapp.com" → "token". */
export function tokenFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  for (const part of address.split(",")) {
    const m = /\+([A-Za-z0-9]+)@/.exec(part);
    if (m && TOKEN_RE.test(m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return null;
}

/** The address shown to the seller, from INBOUND_EMAIL_ADDRESS_TEMPLATE ("abc+{token}@inbound.postmarkapp.com") or a domain. */
export function inboundAddress(token: string, config: { template?: string | null; domain?: string | null }): string | null {
  if (config.template && config.template.includes("{token}")) return config.template.replace("{token}", token);
  if (config.domain) return `ventes+${token}@${config.domain.replace(/^@/, "")}`;
  return null;
}
