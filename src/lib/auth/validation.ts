import type { Locale } from "@/i18n/config";
import { authValidationMessages } from "@/i18n/messages/auth-validation";

/**
 * Password policy. Must match supabase/config.toml (minimum_password_length,
 * password_requirements) and the hosted project's Auth settings.
 */
export const PASSWORD_MIN_LENGTH = 10;

export function passwordChecks(password: string, locale: Locale = "en") {
  const t = authValidationMessages[locale].rules;
  return [
    { id: "length", label: t.length(PASSWORD_MIN_LENGTH), ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "letter", label: t.letter, ok: /\p{L}/u.test(password) },
    { id: "digit", label: t.digit, ok: /\d/.test(password) },
  ];
}

export function isPasswordValid(password: string) {
  return passwordChecks(password).every((c) => c.ok) && password.length <= 72;
}

export function isEmailValid(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Maps Supabase Auth error codes to messages that help without revealing account existence. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined, locale: Locale = "en"): string {
  const t = authValidationMessages[locale].errors;
  switch (error?.code) {
    case "invalid_credentials":
      return t.invalidCredentials;
    case "email_not_confirmed":
      return t.emailNotConfirmed;
    case "weak_password":
      return t.weakPassword;
    case "same_password":
      return t.samePassword;
    case "over_email_send_rate_limit": {
      // Supabase allows one email per address per minute and says how long to wait.
      const seconds = Number(/after (\d+) seconds?/.exec(error.message ?? "")?.[1]);
      return seconds > 0 ? t.waitBeforeResend(seconds) : t.rateLimited;
    }
    case "over_request_rate_limit":
      return t.rateLimited;
    case "user_already_exists":
    case "email_exists":
      return t.userExists;
    case "otp_expired":
      return t.otpExpired;
    case "session_not_found":
    case "refresh_token_not_found":
      return t.sessionEnded;
    default:
      if (error?.status === 429) return t.rateLimited;
      return t.generic;
  }
}
