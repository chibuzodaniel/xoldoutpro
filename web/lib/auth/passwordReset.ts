// Firebase's generatePasswordResetLink always returns a link hosted on
// Firebase's own domain — there's no supported option to change that host
// directly (checked against Firebase's docs; see the reset-password route's
// own history for why this was worth confirming rather than assuming). The
// documented way to get a fully custom-domain reset UI is to extract the
// `oobCode` query param — a plain, host-independent value Firebase already
// generated — and rebuild a URL around it on this app's own domain instead.
// verifyPasswordResetCode/confirmPasswordReset (app/(auth)/reset-password)
// take that same code straight to Firebase directly, regardless of which
// host served the page that collected it.
const RESET_PASSWORD_URL = "https://www.xoldout.app/reset-password";

export function buildOwnDomainPasswordResetLink(firebaseLink: string): string {
  const oobCode = new URL(firebaseLink).searchParams.get("oobCode");
  if (!oobCode) throw new Error("generatePasswordResetLink returned no oobCode");
  return `${RESET_PASSWORD_URL}?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
}
