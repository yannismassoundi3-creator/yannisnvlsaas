import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { ProfitCalculator } from "@/components/calculator/profit-calculator";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProductForm } from "@/components/products/product-form";
import { StoreSettingsForm } from "@/components/settings/settings-forms";
import { AddOrderDialog } from "@/components/transactions/transaction-forms";
import type { Locale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/client";
import { authFormMessages } from "@/i18n/messages/auth-forms";
import { onboardingMessages } from "@/i18n/messages/auth-onboarding";
import { marketingLegal } from "@/i18n/messages/marketing-legal";
import { transactionsMessages } from "@/i18n/messages/catalog-transactions";
import { createWorkspace } from "@/lib/onboarding/actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/browser", () => ({ getBrowserClient: () => ({ auth: { signUp: vi.fn(async () => ({ error: null })) } }) }));
vi.mock("@/lib/onboarding/actions", () => ({ createWorkspace: vi.fn(async () => ({ ok: true })), createDemoStore: vi.fn(), completeOnboarding: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({
  updateProfile: vi.fn(),
  updateLanguage: vi.fn(),
  changePassword: vi.fn(),
  changeEmail: vi.fn(),
  updateStoreSettings: vi.fn(async () => ({ ok: true })),
  createStore: vi.fn(),
  deleteStore: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/lib/products/actions", () => ({ createProduct: vi.fn(), updateProduct: vi.fn(), updateProductCost: vi.fn() }));
vi.mock("@/lib/transactions/actions", () => ({
  createExpense: vi.fn(),
  createManualOrder: vi.fn(),
  createRefund: vi.fn(),
  deleteExpense: vi.fn(),
  deleteOrder: vi.fn(),
  deleteRefund: vi.fn(),
  updateOrderCosts: vi.fn(),
}));
vi.mock("@/components/ui/toaster", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/i18n/server", () => ({ getLocale: vi.fn(async () => "fr") }));

// Radix switches and checkboxes measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const inLocale = (locale: Locale, ui: ReactNode) => <LocaleProvider locale={locale}>{ui}</LocaleProvider>;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("decimal values in French forms", () => {
  const store = {
    name: "Boutique",
    timezone: "Europe/Paris",
    currency: "EUR",
    pricesIncludeTax: true,
    feeRuleBps: 150,
    feeRuleFixedMinor: 25,
    defaultShippingCostMinor: 550,
  };

  it("shows store cost rules with a decimal comma", () => {
    render(inLocale("fr", <StoreSettingsForm store={store} disabled={false} />));
    expect(screen.getByDisplayValue("1,5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0,25")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5,50")).toBeInTheDocument();
  });

  it("keeps the dot in English", () => {
    render(inLocale("en", <StoreSettingsForm store={store} disabled={false} />));
    expect(screen.getByDisplayValue("0.25")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5.50")).toBeInTheDocument();
  });

  it("shows product cost and price with a decimal comma", () => {
    render(inLocale("fr", <ProductForm currency="EUR" initial={{ name: "Vase", sku: null, unitCostE4: 112_000, priceMinor: 2_490 }} productId="p1" submitLabel="Enregistrer" />));
    expect(screen.getByDisplayValue("11,20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("24,90")).toBeInTheDocument();
  });

  it("fills the calculator example with decimal commas and still computes", () => {
    render(inLocale("fr", <ProfitCalculator />));
    expect(screen.getByDisplayValue("1,5")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0,25")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("1.5")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });
});

describe("time zone picker in store settings", () => {
  const store = { name: "Boutique", timezone: "America/Scoresbysund", currency: "EUR", pricesIncludeTax: true, feeRuleBps: null, feeRuleFixedMinor: null, defaultShippingCostMinor: null };

  it("server-renders only the saved zone, labelled by its identifier", () => {
    const html = renderToString(inLocale("fr", <StoreSettingsForm store={store} disabled={false} />));
    const select = html.slice(html.indexOf("<select"), html.indexOf("</select>"));
    expect(select.match(/<option/g)).toHaveLength(1);
    expect(select).toMatch(/>America\/Scoresbysund<\/option>/);
  });

  it("lists every zone with its UTC offset once in the browser", () => {
    render(inLocale("fr", <StoreSettingsForm store={store} disabled={false} />));
    const options = within(screen.getByRole("combobox")).getAllByRole("option");
    expect(options.length).toBeGreaterThan(100);
    expect(options[0]).toHaveTextContent(/^UTC$/);
    expect(screen.getByRole("option", { name: /^America\/Scoresbysund \(UTC−0[12]:00\)$/ })).toHaveAttribute("value", "America/Scoresbysund");
    expect(options.some((o) => /heure|Ittoqqortoormiit/.test(o.textContent ?? ""))).toBe(false);
  });
});

describe("onboarding", () => {
  const t = onboardingMessages.fr;

  async function reachTaxQuestion() {
    const user = userEvent.setup();
    render(inLocale("fr", <OnboardingFlow initialStep={0} defaultName={null} />));
    await user.type(screen.getByLabelText(t.profile.storeName), "Ma boutique");
    await user.click(screen.getByRole("button", { name: t.profile.continue }));
    return user;
  }

  it("offers a no-VAT answer next to the two usual ones and submits it", async () => {
    const user = await reachTaxQuestion();
    expect(screen.getByRole("radio", { name: new RegExp(t.reporting.taxYes) })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: new RegExp(t.reporting.taxNo) })).toBeInTheDocument();
    const none = screen.getByRole("radio", { name: new RegExp(t.reporting.taxNone) });
    expect(screen.getByText(t.reporting.taxNoneText)).toBeInTheDocument();
    await user.click(none);
    await user.click(screen.getByRole("button", { name: t.reporting.submit }));
    expect(createWorkspace).toHaveBeenCalledWith(expect.objectContaining({ storeName: "Ma boutique", pricesIncludeTax: "none" }));
  });

  it("lets long step labels wrap in the side column instead of clipping them", () => {
    render(inLocale("fr", <OnboardingFlow initialStep={0} defaultName={null} />));
    const label = screen.getByText(t.steps[3]);
    expect(label).toHaveClass("md:whitespace-normal");
    expect(within(label).getByText(t.optional)).toHaveClass("md:block");
  });
});

describe("sign-up field errors", () => {
  const m = authFormMessages.fr;

  it("clears each error once its field becomes valid", async () => {
    const user = userEvent.setup();
    render(inLocale("fr", <SignUpForm />));
    await user.click(screen.getByRole("button", { name: m.signUp.submit }));
    expect(screen.getByText(m.invalidEmail)).toBeInTheDocument();
    expect(screen.getByText(m.signUp.passwordInvalid)).toBeInTheDocument();
    expect(screen.getByText(m.signUp.acceptTerms)).toBeInTheDocument();

    const email = screen.getByLabelText(m.signUp.workEmail);
    await user.type(email, "marie@");
    expect(screen.getByText(m.invalidEmail)).toBeInTheDocument(); // still invalid
    await user.type(email, "exemple.fr");
    expect(screen.queryByText(m.invalidEmail)).not.toBeInTheDocument();
    expect(email).not.toHaveAttribute("aria-invalid");

    await user.type(screen.getByLabelText(m.password), "motdepasse2026");
    expect(screen.queryByText(m.signUp.passwordInvalid)).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox"));
    expect(screen.queryByText(m.signUp.acceptTerms)).not.toBeInTheDocument();
  });
});

describe("manual order entry", () => {
  it("opens the order dialog on arrival when asked (empty overview link)", () => {
    render(inLocale("fr", <AddOrderDialog currency="EUR" defaultDate="2026-10-17" pricesIncludeTax={false} products={[]} disabled={false} defaultOpen />));
    expect(screen.getByRole("dialog", { name: transactionsMessages.fr.addOrderTitle })).toBeInTheDocument();
  });

  it("stays closed when the store is read-only", () => {
    render(inLocale("fr", <AddOrderDialog currency="EUR" defaultDate="2026-10-17" pricesIncludeTax={false} products={[]} disabled defaultOpen />));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("legal notice", () => {
  const t = marketingLegal.fr.notice;

  async function renderLegal() {
    vi.resetModules();
    const { default: LegalNoticePage } = await import("@/app/[lang]/(marketing)/legal/page");
    render(await LegalNoticePage());
  }

  it("hides the registration row until a registration is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMPANY_REGISTRATION", "");
    vi.stubEnv("NEXT_PUBLIC_COMPANY_LEGAL_NAME", "");
    await renderLegal();
    expect(screen.queryByRole("rowheader", { name: t.registration })).not.toBeInTheDocument();
    expect(screen.queryByText(t.registration)).not.toBeInTheDocument();
    // Other missing details still say so.
    expect(screen.getByText(t.company).closest("tr")).toHaveTextContent(t.notConfigured);
  });

  it("shows the registration once configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_COMPANY_REGISTRATION", "SIRET 123 456 789 00012");
    await renderLegal();
    expect(screen.getByText(t.registration).closest("tr")).toHaveTextContent("SIRET 123 456 789 00012");
  });
});
