// MotoQueue uses the PHONE NUMBER as the login identifier — most users
// don't have an email address. Supabase Auth still needs an "email" + a
// "password" internally, so we derive both from the phone number. The user
// only ever enters a phone number and a one-time code.
//
// Auth UX: phone -> OTP. For the MVP the OTP is a DUMMY code (see DEMO_OTP);
// a real SMS provider (Twilio, etc.) would replace this later. The Supabase
// project MUST have "Confirm email" turned OFF.

// IMPORTANT: must be a real, public TLD. Reserved TLDs like `.local`, `.test`,
// `.example`, `.invalid` are rejected by Supabase's email validator. The domain
// never receives mail (email confirmation is off) — it's just an internal key.
const PHONE_EMAIL_DOMAIN = 'motoqueue.app'

/** Demo one-time code. Replace with a real SMS OTP provider for production. */
export const DEMO_OTP = '1234'

/** Strip everything except digits so "0917-123 4567" and "09171234567" match. */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '')
}

/** Map a phone number to the synthetic email used for Supabase auth. */
export function phoneToEmail(phone: string): string {
  return `${normalizePhone(phone)}@${PHONE_EMAIL_DOMAIN}`
}

/**
 * Deterministic hidden password derived from the phone number, so sign-in
 * always reproduces the same credential. NOTE: with a dummy OTP this is not a
 * real security boundary — it exists only to satisfy Supabase's password auth.
 * Replace the whole flow with real phone OTP before production.
 */
export function derivePassword(phone: string): string {
  return `mq:${normalizePhone(phone)}:otp-v1`
}

/** Loose validity check for the MVP: a local mobile number is at least 7 digits. */
export function isValidPhone(input: string): boolean {
  return normalizePhone(input).length >= 7
}
