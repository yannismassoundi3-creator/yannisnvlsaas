import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { StoreSwitcher } from "@/components/app/store-switcher";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { Field } from "@/components/ui/field";
import { TermTip } from "@/components/ui/overlay";
import type { Locale } from "@/i18n/config";
import { LocaleProvider } from "@/i18n/client";

vi.mock("next/navigation", () => ({ usePathname: () => "/app/products", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/workspace/actions", () => ({ switchStore: vi.fn(async () => ({ ok: true })) }));

function renderIn(locale: Locale, ui: ReactNode) {
  return render(<LocaleProvider locale={locale}>{ui}</LocaleProvider>);
}

const stores = [
  { id: "a", name: "E2E Goods", currency: "EUR", isDemo: false },
  { id: "b", name: "Sample store", currency: "EUR", isDemo: true },
];

describe("application shell in English and French", () => {
  it("keeps the English store switcher name and translates it", () => {
    const { unmount } = renderIn("en", <StoreSwitcher stores={stores} activeId="a" />);
    expect(screen.getByRole("button", { name: /E2E Goods.*switch store/i })).toBeInTheDocument();
    unmount();
    renderIn("fr", <StoreSwitcher stores={stores} activeId="b" />);
    expect(screen.getByRole("button", { name: /Sample store.*Démo.*changer de boutique/ })).toBeInTheDocument();
  });

  it("labels the navigation in the interface language", () => {
    const { unmount } = renderIn("en", <SidebarNav />);
    expect(screen.getByRole("link", { name: "Transactions & costs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    unmount();
    renderIn("fr", <SidebarNav />);
    expect(screen.getByRole("link", { name: "Vue d'ensemble" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Transactions et coûts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Produits" })).toHaveAttribute("aria-current", "page");
  });

  it("translates the default text of generic components", () => {
    renderIn(
      "fr",
      <>
        <Field htmlFor="x" label="Description" optional>
          <input id="x" />
        </Field>
        <TermTip term="Marge sur coûts variables">…</TermTip>
      </>,
    );
    expect(screen.getByText("Facultatif")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Qu'est-ce que « Marge sur coûts variables » ?" })).toBeInTheDocument();
  });
});
