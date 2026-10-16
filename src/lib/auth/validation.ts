/**
 * Password policy. Must match supabase/config.toml (minimum_password_length,
 * password_requirements) and the hosted project's Auth settings.
 */
export const PASSWORD_MIN_LENGTH = 10;

export function passwordChecks(password: string) {
  return [
    { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { id: "letter", label: "At least one letter", ok: /\p{L}/u.test(password) },
    { id: "digit", label: "At least one number", ok: /\d/.test(password) },
  ];
}

export function isPasswordValid(password: string) {
  return passwordChecks(password).every((c) => c.ok) && password.length <= 72;
}

export function isEmailValid(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Maps Supabase Auth error codes to messages that help without revealing account existence. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Please confirm your email address first. Check your inbox for the confirmation link.";
    case "weak_password":
      return "Choose a stronger password: at least 10 characters with letters and numbers.";
    case "same_password":
      return "Your new password must be different from the current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "user_already_exists":
    case "email_exists":
      return "We could not create an account with this email. Try signing in or resetting your password.";
    case "otp_expired":
      return "This link has expired. Request a new one.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has ended. Please sign in again.";
    default:
      if (error?.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
      return "Something went wrong. Please try again.";
  }
}
