"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { COMMON_CURRENCIES, currencyName, currencySymbol } from "@/lib/finance/currency";
import { bpsToInputValue } from "@/lib/finance/input";
import { minorToInputValue } from "@/lib/finance/money";
import { otherCurrencies, timezoneOptions } from "@/lib/locale-lists";
import { PLATFORM_NAMES, PLATFORMS, type PlatformId } from "@/lib/onboarding/constants";
import { changeEmail, changePassword, createStore, deleteAccount, deleteStore, updateProfile, updateStoreSettings } from "@/lib/settings/actions";

type Errors = Record<string, string>;

function useResult() {
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  return {
    errors,
    message,
    handle(r: { ok: boolean; message?: string; fieldErrors?: Errors }, success: string) {
      if (r.ok) {
        setErrors({});
        setMessage(null);
        toast.success(success);
        return true;
      }
      setErrors(r.fieldErrors ?? {});
      setMessage(r.fieldErrors ? null : (r.message ?? "Something went wrong."));
      return false;
    },
  };
}

const Message = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="text-sm font-medium text-negative-700">
      {text}
    </p>
  ) : null;

// -----------------------------------------------------------------------------
export function ProfileForms({ fullName, email }: { fullName: string | null; email: string | null }) {
  const id = useId();
  const [name, setName] = useState(fullName ?? "");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const profile = useResult();
  const emailResult = useResult();
  const passwordResult = useResult();
  const [pending, startTransition] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const run = (key: string, task: () => Promise<void>) => {
    setWhich(key);
    startTransition(task);
  };

  return (
    <div className="space-y-8">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run("profile", async () => {
            profile.handle(await updateProfile({ fullName: name }), "Profile saved.");
          });
        }}
      >
        <Field htmlFor={`${id}-name`} label="Your name" error={profile.errors.fullName}>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Message text={profile.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "profile"}>
          Save name
        </Button>
      </form>

      <form
        className="space-y-4 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("email", async () => {
            if (emailResult.handle(await changeEmail({ email: newEmail }), "Check both inboxes to confirm the change.")) setNewEmail("");
          });
        }}
      >
        <Field htmlFor={`${id}-email`} label="Email address" hint={`Currently ${email ?? "unknown"}. We send a confirmation link to the new address before switching.`} error={emailResult.errors.email}>
          <Input id={`${id}-email`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@example.com" autoComplete="email" aria-describedby={describedBy(`${id}-email`, { hint: true, error: emailResult.errors.email })} />
        </Field>
        <Message text={emailResult.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "email"} disabled={!newEmail}>
          Change email
        </Button>
      </form>

      <form
        className="space-y-4 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("password", async () => {
            if (passwordResult.handle(await changePassword({ password }), "Password changed.")) setPassword("");
          });
        }}
      >
        <Field htmlFor={`${id}-password`} label="New password" hint="At least 10 characters, with letters and digits." error={passwordResult.errors.password}>
          <Input id={`${id}-password`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby={describedBy(`${id}-password`, { hint: true, error: passwordResult.errors.password })} />
        </Field>
        <Message text={passwordResult.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "password"} disabled={!password}>
          Change password
        </Button>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
type StoreValues = { name: string; timezone: string; currency: string; pricesIncludeTax: boolean; feeRuleBps: number | null; feeRuleFixedMinor: number | null; defaultShippingCostMinor: number | null };

export function StoreSettingsForm({ store, disabled }: { store: StoreValues; disabled: boolean }) {
  const id = useId();
  const [v, setV] = useState({
    name: store.name,
    timezone: store.timezone,
    pricesIncludeTax: store.pricesIncludeTax,
    feePercent: store.feeRuleBps === null ? "" : bpsToInputValue(store.feeRuleBps),
    feeFixed: store.feeRuleFixedMinor === null ? "" : minorToInputValue(store.feeRuleFixedMinor, store.currency),
    defaultShipping: store.defaultShippingCostMinor === null ? "" : minorToInputValue(store.defaultShippingCostMinor, store.currency),
  });
  const result = useResult();
  const [pending, startTransition] = useTransition();
  const timezones = useMemo(() => timezoneOptions([store.timezone]), [store.timezone]);
  const symbol = currencySymbol(store.currency);

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          result.handle(await updateStoreSettings(v), "Store settings saved. Reports use them right away.");
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`${id}-name`} label="Store name" error={result.errors.name}>
          <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={disabled} />
        </Field>
        <Field htmlFor={`${id}-currency`} label="Currency" hint="Fixed once data exists, so stored amounts never change meaning.">
          <Input id={`${id}-currency`} value={`${store.currency} · ${currencyName(store.currency)}`} disabled readOnly />
        </Field>
        <Field htmlFor={`${id}-tz`} label="Reporting time zone" hint="Orders count on the day they were placed in this zone." error={result.errors.timezone}>
          <NativeSelect id={`${id}-tz`} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} disabled={disabled}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replaceAll("_", " ")}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex items-start gap-3 pt-6">
          <Switch id={`${id}-tax`} checked={v.pricesIncludeTax} onCheckedChange={(c) => setV({ ...v, pricesIncludeTax: c })} disabled={disabled} aria-describedby={`${id}-tax-hint`} />
          <div>
            <label htmlFor={`${id}-tax`} className="text-sm font-medium text-ink">
              Prices include VAT / sales tax
            </label>
            <p id={`${id}-tax-hint`} className="text-xs text-ink-3">
              Default for new imports and manual orders. Records already saved are not changed.
            </p>
          </div>
        </div>
      </div>

      <fieldset id="costs" className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">Estimates for orders without recorded costs</legend>
        <p className="text-sm text-ink-3">
          Used only when an order has no recorded value. Estimated amounts are always labelled in reports. Leave empty to show them as missing instead.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field htmlFor={`${id}-fee`} label="Payment fee rate" hint="Share of the amount paid, e.g. 1.5" error={result.errors.feePercent}>
            <Input id={`${id}-fee`} inputMode="decimal" trailing="%" value={v.feePercent} onChange={(e) => setV({ ...v, feePercent: e.target.value })} disabled={disabled} />
          </Field>
          <Field htmlFor={`${id}-fixed`} label="Fixed fee per order" hint="e.g. 0.25" error={result.errors.feeFixed}>
            <Input id={`${id}-fixed`} inputMode="decimal" leading={symbol} value={v.feeFixed} onChange={(e) => setV({ ...v, feeFixed: e.target.value })} disabled={disabled} />
          </Field>
          <Field htmlFor={`${id}-ship`} label="Shipping cost per order" hint="Your average label and packing cost" error={result.errors.defaultShipping}>
            <Input id={`${id}-ship`} inputMode="decimal" leading={symbol} value={v.defaultShipping} onChange={(e) => setV({ ...v, defaultShipping: e.target.value })} disabled={disabled} />
          </Field>
        </div>
      </fieldset>
      <Message text={result.message} />
      <Button type="submit" loading={pending} disabled={disabled}>
        Save store settings
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function AddStoreDialog({ disabled, reason }: { disabled: boolean; reason?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const browserTz = typeof window === "undefined" ? "UTC" : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [v, setV] = useState({ name: "", platform: "shopify" as PlatformId, currency: "EUR", timezone: browserTz, pricesIncludeTax: true });
  const result = useResult();
  const [pending, startTransition] = useTransition();
  const timezones = useMemo(() => timezoneOptions([browserTz]), [browserTz]);
  const moreCurrencies = useMemo(() => otherCurrencies(), []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled} title={reason}>
          <Plus aria-hidden />
          Add store
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a store" description="Each store has its own currency, products and reports.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (result.handle(await createStore(v), "Store added. You are now viewing it.")) setOpen(false);
            });
          }}
        >
          <Field htmlFor={`${id}-name`} label="Store name" error={result.errors.name}>
            <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-platform`} label="Platform">
              <NativeSelect id={`${id}-platform`} value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value as PlatformId })}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_NAMES[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor={`${id}-currency`} label="Currency" hint="Cannot be changed later." error={result.errors.currency}>
              <NativeSelect id={`${id}-currency`} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
                <optgroup label="Common">
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c} · {currencyName(c)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="All currencies">
                  {moreCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c} · {currencyName(c)}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </Field>
          </div>
          <Field htmlFor={`${id}-tz`} label="Reporting time zone" error={result.errors.timezone}>
            <NativeSelect id={`${id}-tz`} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replaceAll("_", " ")}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-3 text-sm text-ink">
            <Switch checked={v.pricesIncludeTax} onCheckedChange={(c) => setV({ ...v, pricesIncludeTax: c })} />
            Prices include VAT / sales tax
          </label>
          <Message text={result.message} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              Add store
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteStoreButton({ storeId, storeName, isDemo }: { storeId: string; storeName: string; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setConfirm("");
        setError(null);
      }}
      trigger={
        <Button variant="danger-ghost" size="sm">
          <Trash2 aria-hidden />
          {isDemo ? "Remove sample store" : "Delete"}
        </Button>
      }
      title={isDemo ? "Remove the sample store?" : `Delete ${storeName}?`}
      description={
        isDemo
          ? "The fictional demo data is removed. You can create a new sample store at any time."
          : "All products, orders, refunds, expenses, advertising data and imports of this store are permanently deleted. This cannot be undone. Export your data first if you may need it."
      }
      confirmLabel={isDemo ? "Remove" : "Delete store"}
      destructive
      pending={pending}
      onConfirm={() =>
        new Promise<void>((resolve) =>
          startTransition(async () => {
            const r = await deleteStore(storeId, confirm);
            resolve();
            if (!r.ok) setError(r.message);
            else {
              setOpen(false);
              toast.success(isDemo ? "Sample store removed." : "Store deleted.");
            }
          }),
        )
      }
    >
      {!isDemo ? (
        <div className="space-y-1.5">
          <label htmlFor={`confirm-${storeId}`} className="text-sm font-medium text-ink">
            Type <span className="font-semibold">{storeName}</span> to confirm
          </label>
          <Input id={`confirm-${storeId}`} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          {error ? <p className="text-sm text-negative-700">{error}</p> : null}
        </div>
      ) : error ? (
        <p className="text-sm text-negative-700">{error}</p>
      ) : null}
    </ConfirmDialog>
  );
}

// -----------------------------------------------------------------------------
export function DataControls({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-ink">Download your data</h3>
        <p className="text-sm text-ink-3">
          A JSON file with every store, product, order, refund, expense, campaign, import record and your account details. Available on every plan, also after a
          trial or subscription ends.
        </p>
        <Button variant="secondary" asChild>
          <a href="/api/account/export" download>
            <Download aria-hidden />
            Download all data (JSON)
          </a>
        </Button>
      </div>
      <div className="space-y-2 border-t border-line pt-6">
        <h3 className="font-medium text-negative-700">Delete account</h3>
        <p className="text-sm text-ink-3">
          {isOwner
            ? "Cancels any subscription immediately, then permanently deletes your organisation, all stores and records, and your login. This cannot be undone."
            : "Removes your login. The organisation's data stays with its owner."}
        </p>
        <ConfirmDialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            setConfirm("");
            setError(null);
          }}
          trigger={
            <Button variant="danger">
              <Trash2 aria-hidden />
              Delete account
            </Button>
          }
          title="Delete your account permanently?"
          description="Download your data first if you may need it. After deletion it cannot be recovered."
          confirmLabel="Delete account"
          destructive
          pending={pending}
          onConfirm={() =>
            new Promise<void>((resolve) =>
              startTransition(async () => {
                // On success the action signs out and redirects.
                const r = await deleteAccount({ confirm });
                resolve();
                if (r && !r.ok) setError(r.message);
              }),
            )
          }
        >
          <div className="space-y-1.5">
            <label htmlFor="confirm-delete-account" className="text-sm font-medium text-ink">
              Type <span className="font-semibold">DELETE</span> to confirm
            </label>
            <Input id="confirm-delete-account" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            {error ? <p className="text-sm text-negative-700">{error}</p> : null}
          </div>
        </ConfirmDialog>
      </div>
    </div>
  );
}
