"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { describedBy, Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/config";
import { useLocale } from "@/i18n/client";
import { settingsForms } from "@/i18n/messages/account-settings";
import { COMMON_CURRENCIES, currencySymbol } from "@/lib/finance/currency";
import { bpsToInputValue } from "@/lib/finance/input";
import { minorToInputValue } from "@/lib/finance/money";
import { currencyLabel, otherCurrencies, timezoneLabel, timezoneOptions } from "@/lib/locale-lists";
import { platformName, PLATFORMS, type PlatformId } from "@/lib/onboarding/constants";
import { changeEmail, changePassword, createStore, deleteAccount, deleteStore, updateLanguage, updateProfile, updateStoreSettings } from "@/lib/settings/actions";

type Errors = Record<string, string>;

function useResult() {
  const t = settingsForms[useLocale()];
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
      setMessage(r.fieldErrors ? null : (r.message ?? t.genericError));
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
  const locale = useLocale();
  const t = settingsForms[locale];
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(fullName ?? "");
  const [language, setLanguage] = useState<Locale>(locale);
  const languageResult = useResult();
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
            profile.handle(await updateProfile({ fullName: name }), t.profileSaved);
          });
        }}
      >
        <Field htmlFor={`${id}-name`} label={t.yourName} error={profile.errors.fullName}>
          <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Message text={profile.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "profile"}>
          {t.saveName}
        </Button>
      </form>

      <form
        className="space-y-4 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("language", async () => {
            // Confirm in the newly chosen language, then reload the page in it.
            if (languageResult.handle(await updateLanguage({ locale: language }), settingsForms[language].languageSaved)) router.refresh();
          });
        }}
      >
        <Field htmlFor={`${id}-language`} label={t.language} hint={t.languageHint}>
          <NativeSelect id={`${id}-language`} value={language} onChange={(e) => setLanguage(e.target.value as Locale)} aria-describedby={describedBy(`${id}-language`, { hint: true })}>
            {LOCALES.map((l) => (
              <option key={l} value={l} lang={l}>
                {LOCALE_NAMES[l]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Message text={languageResult.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "language"} disabled={language === locale}>
          {t.saveLanguage}
        </Button>
      </form>

      <form
        className="space-y-4 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("email", async () => {
            if (emailResult.handle(await changeEmail({ email: newEmail }), t.emailChangeStarted)) setNewEmail("");
          });
        }}
      >
        <Field htmlFor={`${id}-email`} label={t.emailAddress} hint={t.emailHint(email)} error={emailResult.errors.email}>
          <Input id={`${id}-email`} type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder={t.emailPlaceholder} autoComplete="email" aria-describedby={describedBy(`${id}-email`, { hint: true, error: emailResult.errors.email })} />
        </Field>
        <Message text={emailResult.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "email"} disabled={!newEmail}>
          {t.changeEmail}
        </Button>
      </form>

      <form
        className="space-y-4 border-t border-line pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          run("password", async () => {
            if (passwordResult.handle(await changePassword({ password }), t.passwordChanged)) setPassword("");
          });
        }}
      >
        <Field htmlFor={`${id}-password`} label={t.newPassword} hint={t.passwordHint} error={passwordResult.errors.password}>
          <Input id={`${id}-password`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-describedby={describedBy(`${id}-password`, { hint: true, error: passwordResult.errors.password })} />
        </Field>
        <Message text={passwordResult.message} />
        <Button type="submit" variant="secondary" loading={pending && which === "password"} disabled={!password}>
          {t.changePassword}
        </Button>
      </form>
    </div>
  );
}

// -----------------------------------------------------------------------------
type StoreValues = { name: string; timezone: string; currency: string; pricesIncludeTax: boolean; feeRuleBps: number | null; feeRuleFixedMinor: number | null; defaultShippingCostMinor: number | null };

export function StoreSettingsForm({ store, disabled }: { store: StoreValues; disabled: boolean }) {
  const locale = useLocale();
  const t = settingsForms[locale];
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
          result.handle(await updateStoreSettings(v), t.storeSaved);
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor={`${id}-name`} label={t.storeName} error={result.errors.name}>
          <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={disabled} />
        </Field>
        <Field htmlFor={`${id}-currency`} label={t.currency} hint={t.currencyFixedHint}>
          <Input id={`${id}-currency`} value={currencyLabel(store.currency, locale)} disabled readOnly />
        </Field>
        <Field htmlFor={`${id}-tz`} label={t.timezone} hint={t.timezoneHint} error={result.errors.timezone}>
          <NativeSelect id={`${id}-tz`} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} disabled={disabled}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {timezoneLabel(tz, locale)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="flex items-start gap-3 pt-6">
          <Switch id={`${id}-tax`} checked={v.pricesIncludeTax} onCheckedChange={(c) => setV({ ...v, pricesIncludeTax: c })} disabled={disabled} aria-describedby={`${id}-tax-hint`} />
          <div>
            <label htmlFor={`${id}-tax`} className="text-sm font-medium text-ink">
              {t.pricesIncludeTax}
            </label>
            <p id={`${id}-tax-hint`} className="text-xs text-ink-3">
              {t.pricesIncludeTaxHint}
            </p>
          </div>
        </div>
      </div>

      <fieldset id="costs" className="space-y-4 rounded-lg border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink">{t.estimatesLegend}</legend>
        <p className="text-sm text-ink-3">{t.estimatesBody}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field htmlFor={`${id}-fee`} label={t.feeRate} hint={t.feeRateHint} error={result.errors.feePercent}>
            <Input id={`${id}-fee`} inputMode="decimal" trailing="%" value={v.feePercent} onChange={(e) => setV({ ...v, feePercent: e.target.value })} disabled={disabled} />
          </Field>
          <Field htmlFor={`${id}-fixed`} label={t.feeFixed} hint={t.feeFixedHint} error={result.errors.feeFixed}>
            <Input id={`${id}-fixed`} inputMode="decimal" leading={symbol} value={v.feeFixed} onChange={(e) => setV({ ...v, feeFixed: e.target.value })} disabled={disabled} />
          </Field>
          <Field htmlFor={`${id}-ship`} label={t.shippingPerOrder} hint={t.shippingPerOrderHint} error={result.errors.defaultShipping}>
            <Input id={`${id}-ship`} inputMode="decimal" leading={symbol} value={v.defaultShipping} onChange={(e) => setV({ ...v, defaultShipping: e.target.value })} disabled={disabled} />
          </Field>
        </div>
      </fieldset>
      <Message text={result.message} />
      <Button type="submit" loading={pending} disabled={disabled}>
        {t.saveStore}
      </Button>
    </form>
  );
}

// -----------------------------------------------------------------------------
export function AddStoreDialog({ disabled, reason }: { disabled: boolean; reason?: string }) {
  const locale = useLocale();
  const t = settingsForms[locale];
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
          {t.addStore}
        </Button>
      </DialogTrigger>
      <DialogContent title={t.addStoreTitle} description={t.addStoreDescription}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (result.handle(await createStore(v), t.storeAdded)) setOpen(false);
            });
          }}
        >
          <Field htmlFor={`${id}-name`} label={t.storeName} error={result.errors.name}>
            <Input id={`${id}-name`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor={`${id}-platform`} label={t.platform}>
              <NativeSelect id={`${id}-platform`} value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value as PlatformId })}>
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(p, locale)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field htmlFor={`${id}-currency`} label={t.currency} hint={t.currencyLockedHint} error={result.errors.currency}>
              <NativeSelect id={`${id}-currency`} value={v.currency} onChange={(e) => setV({ ...v, currency: e.target.value })}>
                <optgroup label={t.commonCurrencies}>
                  {COMMON_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {currencyLabel(c, locale)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={t.allCurrencies}>
                  {moreCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {currencyLabel(c, locale)}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </Field>
          </div>
          <Field htmlFor={`${id}-tz`} label={t.timezone} error={result.errors.timezone}>
            <NativeSelect id={`${id}-tz`} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })}>
              {timezones.map((tz) => (
                <option key={tz} value={tz}>
                  {timezoneLabel(tz, locale)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-3 text-sm text-ink">
            <Switch checked={v.pricesIncludeTax} onCheckedChange={(c) => setV({ ...v, pricesIncludeTax: c })} />
            {t.pricesIncludeTax}
          </label>
          <Message text={result.message} />
          <div className="flex justify-end">
            <Button type="submit" loading={pending}>
              {t.addStore}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteStoreButton({ storeId, storeName, isDemo }: { storeId: string; storeName: string; isDemo: boolean }) {
  const t = settingsForms[useLocale()];
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
          {isDemo ? t.removeSample : t.delete}
        </Button>
      }
      title={isDemo ? t.removeSampleTitle : t.deleteStoreTitle(storeName)}
      description={isDemo ? t.removeSampleBody : t.deleteStoreBody}
      confirmLabel={isDemo ? t.remove : t.deleteStore}
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
              toast.success(isDemo ? t.sampleRemoved : t.storeDeleted);
            }
          }),
        )
      }
    >
      {!isDemo ? (
        <div className="space-y-1.5">
          <label htmlFor={`confirm-${storeId}`} className="text-sm font-medium text-ink">
            {t.typeBefore}
            <span className="font-semibold">{storeName}</span>
            {t.typeAfter}
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
  const t = settingsForms[useLocale()];
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-ink">{t.downloadTitle}</h3>
        <p className="text-sm text-ink-3">{t.downloadBody}</p>
        <Button variant="secondary" asChild>
          <a href="/api/account/export" download>
            <Download aria-hidden />
            {t.downloadAll}
          </a>
        </Button>
      </div>
      <div className="space-y-2 border-t border-line pt-6">
        <h3 className="font-medium text-negative-700">{t.deleteAccount}</h3>
        <p className="text-sm text-ink-3">
          {isOwner ? t.deleteAccountOwner : t.deleteAccountMember}
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
              {t.deleteAccount}
            </Button>
          }
          title={t.deleteAccountTitle}
          description={t.deleteAccountBody}
          confirmLabel={t.deleteAccount}
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
              {t.typeBefore}
              <span className="font-semibold">DELETE</span>
              {t.typeAfter}
            </label>
            <Input id="confirm-delete-account" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            {error ? <p className="text-sm text-negative-700">{error}</p> : null}
          </div>
        </ConfirmDialog>
      </div>
    </div>
  );
}
