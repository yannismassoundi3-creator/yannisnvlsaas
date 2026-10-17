import { describe, expect, it } from "vitest";
import {
  amountCandidates,
  guessAmount,
  guessTitle,
  htmlToText,
  inboundAddress,
  makeExcerpt,
  parseInboundEmail,
  tokenFromAddress,
  unwrapForwarded,
} from "@/lib/inbound/parse";

/**
 * Synthetic emails only: we have no real samples from the platforms, so these
 * check the heuristics, not any platform's exact format.
 */

describe("sale emails", () => {
  it("reads a French Vinted-style email sent directly", () => {
    const parsed = parseInboundEmail({
      from: "Vinted <no-reply@vinted.fr>",
      subject: "Votre article « Veste en jean Levi's » a été vendu !",
      text: [
        "Bonne nouvelle ! Votre article a été vendu.",
        "Prix : 18,50 €",
        "Frais de port (payés par l'acheteur) : 3,99 €",
        "Protection acheteurs : 1,62 €",
        "Vous recevrez 18,50 € sur votre porte-monnaie.",
      ].join("\n"),
      html: "",
    });
    expect(parsed).toMatchObject({ kind: "sale", platform: "vinted", amountMinor: 1850, title: "Veste en jean Levi's", forwarded: false });
  });

  it("unwraps a Gmail forward of an English eBay-style email and prefers the sale price over shipping", () => {
    const parsed = parseInboundEmail({
      from: "Seller <seller@gmail.com>",
      subject: "Fwd: You sold: Nike Air Max 90",
      text: [
        "Here it is",
        "",
        "---------- Forwarded message ---------",
        "From: eBay <ebay@ebay.com>",
        "Date: Sat, 17 Oct 2026 at 10:12",
        "Subject: You sold: Nike Air Max 90",
        "To: <seller@gmail.com>",
        "",
        "Congratulations, your item sold!",
        "Item: Nike Air Max 90",
        "Sold for: €45.00",
        "Shipping: €5.00",
        "Total: €50.00",
      ].join("\n"),
      html: "",
    });
    expect(parsed).toMatchObject({ kind: "sale", platform: "ebay", amountMinor: 4500, title: "Nike Air Max 90", forwarded: true, originalFrom: "eBay <ebay@ebay.com>" });
  });

  it("unwraps an Apple Mail forward in French (Leboncoin, whole euros, curly quotes)", () => {
    const parsed = parseInboundEmail({
      from: "seller@icloud.com",
      subject: "TR: Votre vente est confirmée",
      text: [
        "Début du message réexpédié :",
        "",
        "De: leboncoin <noreply@leboncoin.fr>",
        "Objet: Votre vente est confirmée",
        "Date: 17 octobre 2026 à 09:30:12 UTC+2",
        "",
        "Le paiement de 25 € pour votre annonce “Table basse en chêne” a été reçu.",
      ].join("\n"),
      html: "",
    });
    expect(parsed).toMatchObject({ kind: "sale", platform: "leboncoin", amountMinor: 2500, title: "Table basse en chêne", forwarded: true });
  });

  it("reads an HTML-only email with entities (Vestiaire Collective-style)", () => {
    const parsed = parseInboundEmail({
      from: "Vestiaire Collective <noreply@vestiairecollective.com>",
      subject: "Félicitations, votre article a été vendu",
      text: "",
      html: "<html><head><style>p{color:red}</style></head><body><p>F&eacute;licitations&nbsp;! Votre article <b>Sac Longchamp</b> a &eacute;t&eacute; vendu.</p><p>Montant&nbsp;: 120,00&nbsp;&euro;</p></body></html>",
    });
    expect(parsed.platform).toBe("vestiaire_collective");
    expect(parsed.amountMinor).toBe(12000);
    expect(parsed.excerpt).toContain("Sac Longchamp");
    expect(parsed.excerpt).not.toContain("color:red");
  });

  it("keeps an email without an amount as a pending sale with a null amount", () => {
    const parsed = parseInboundEmail({
      from: "seller@gmail.com",
      subject: "Fwd: Nouveau message de Julie",
      text: "---------- Message transféré ---------\nDe : Vinted <no-reply@vinted.fr>\nObjet : Nouveau message\n\nJulie vous a envoyé un message à propos de votre article.",
      html: "",
    });
    expect(parsed).toMatchObject({ kind: "sale", platform: "vinted", amountMinor: null });
  });

  it("classifies an unrelated email as other, without inventing a platform", () => {
    const parsed = parseInboundEmail({ from: "news@example.test", subject: "Our newsletter", text: "Read our latest articles.", html: "" });
    expect(parsed).toMatchObject({ kind: "other", platform: null, amountMinor: null });
  });

  it("does not read amounts for stores that do not use euros", () => {
    const parsed = parseInboundEmail({ from: "no-reply@vinted.fr", subject: "Vendu", text: "Prix : 18,50 €", html: "" }, "GBP");
    expect(parsed.amountMinor).toBeNull();
  });
});

describe("Gmail forwarding confirmation", () => {
  it("surfaces the link and the code (English)", () => {
    const parsed = parseInboundEmail({
      from: "Gmail Team <forwarding-noreply@google.com>",
      subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from seller@gmail.com",
      text: [
        "seller@gmail.com has requested to automatically forward mail to your email address.",
        "Confirmation code: 123456789",
        "To allow seller@gmail.com to automatically forward mail to your address, please click the link below to confirm the request:",
        "https://mail-settings.google.com/mail/vf-%5BANGjdJ9abc%5D-ZGVm",
      ].join("\n"),
      html: "",
    });
    expect(parsed.kind).toBe("gmail_verification");
    expect(parsed.verification).toEqual({ code: "123456789", url: "https://mail-settings.google.com/mail/vf-%5BANGjdJ9abc%5D-ZGVm" });
    expect(parsed.amountMinor).toBeNull();
  });

  it("surfaces the code of the French version, from the text or the subject", () => {
    const parsed = parseInboundEmail({
      from: "forwarding-noreply@google.com",
      subject: "(#987654321) Confirmation de transfert Gmail - Recevoir des e-mails de vendeuse@gmail.com",
      text: "Code de confirmation : 987654321\nPour autoriser le transfert, cliquez sur le lien suivant : https://mail.google.com/mail/vf-xyz",
      html: "",
    });
    expect(parsed.verification).toEqual({ code: "987654321", url: "https://mail.google.com/mail/vf-xyz" });
    const fromSubject = parseInboundEmail({ from: "forwarding-noreply@google.com", subject: "(#555666777) Gmail Forwarding Confirmation", text: "", html: "<p>Confirm</p>" });
    expect(fromSubject.verification?.code).toBe("555666777");
  });
});

describe("amounts", () => {
  it("recognises the usual euro notations", () => {
    expect(guessAmount("Total : 18,50 €")).toBe(1850);
    expect(guessAmount("Total: €18.50")).toBe(1850);
    expect(guessAmount("Prix 18 €")).toBe(1800);
    expect(guessAmount("Montant : 18 EUR")).toBe(1800);
    expect(guessAmount("Montant : 1 234,56 €")).toBe(123456);
    expect(guessAmount("Total: €1,234.56")).toBe(123456);
    expect(guessAmount("Prix : 18,50 €")).toBe(1850);
    expect(guessAmount("No money here")).toBeNull();
  });

  it("prefers amounts next to sale words and avoids fees", () => {
    expect(guessAmount("Frais de port : 3,99 €\nVendu pour 12 €")).toBe(1200);
    expect(guessAmount("Commission : 2,00 €")).toBeNull();
    expect(amountCandidates("Frais : 1 €\nTotal : 9 €").map((c) => c.minor)).toEqual([100, 900]);
  });
});

describe("titles, wrappers and excerpts", () => {
  it("cleans subjects of boilerplate", () => {
    expect(guessTitle("Fwd: Bonne nouvelle ! Pull marin Saint James vendu", "")).toBe("Pull marin Saint James");
    expect(guessTitle("You sold: Nike Air Max 90 for €45.00", "")).toBe("Nike Air Max 90");
    expect(guessTitle("Vendu !", "")).toBeNull();
  });

  it("finds headers of forwarded messages in Outlook's format", () => {
    const u = unwrapForwarded("-----Original Message-----\nFrom: Vinted <no-reply@vinted.com>\nSent: Saturday\nSubject: Item sold\n\nBody here");
    expect(u).toEqual({ forwarded: true, from: "Vinted <no-reply@vinted.com>", subject: "Item sold", body: "Body here" });
  });

  it("drops buyers' email addresses, phone numbers and postal addresses from the excerpt, and caps its length", () => {
    const excerpt = makeExcerpt(
      ["Acheteur : marie.dupont@example.com", "Téléphone : 06 12 34 56 78", "Adresse de livraison :", "12 rue des Lilas", "75011 Paris", "Prix : 18,50 €"].join("\n"),
    );
    expect(excerpt).not.toMatch(/marie\.dupont|06 12 34 56 78|rue des Lilas|75011/);
    expect(excerpt).toContain("Prix : 18,50 €");
    expect(makeExcerpt("x".repeat(5000)).length).toBeLessThanOrEqual(2000);
  });

  it("turns HTML into readable text", () => {
    expect(htmlToText("<p>Bonjour&nbsp;!</p><p>Prix&nbsp;: 5&#8364;</p><script>alert(1)</script>")).toBe("Bonjour !\nPrix : 5€");
  });
});

describe("inbound addresses", () => {
  const token = "0123456789abcdef0123456789abcdef";

  it("builds the address from the provider template, else from a domain", () => {
    expect(inboundAddress(token, { template: "abc123+{token}@inbound.postmarkapp.com" })).toBe(`abc123+${token}@inbound.postmarkapp.com`);
    expect(inboundAddress(token, { domain: "in.example.test" })).toBe(`ventes+${token}@in.example.test`);
    expect(inboundAddress(token, {})).toBeNull();
  });

  it("finds the token after the plus sign, case-insensitively, and rejects junk", () => {
    expect(tokenFromAddress(`abc123+${token.toUpperCase()}@inbound.postmarkapp.com`)).toBe(token);
    expect(tokenFromAddress(`"Shop" <abc+${token}@inbound.postmarkapp.com>, other@example.test`)).toBe(token);
    expect(tokenFromAddress("abc123+short@inbound.postmarkapp.com")).toBeNull();
    expect(tokenFromAddress("abc123@inbound.postmarkapp.com")).toBeNull();
    expect(tokenFromAddress(null)).toBeNull();
  });
});
