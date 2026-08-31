// Maps Firebase Auth's error codes to plain-language messages. Raw SDK
// errors read like "Firebase: Error (auth/invalid-credential)." — every
// auth call site now shows this instead, as a toast rather than inline
// text (explicit ask — no inline error handling anywhere in the app).
export function friendlyFirebaseError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = err instanceof Error && "code" in err ? String((err as { code: unknown }).code) : null;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect email or password.";
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/email-already-in-use":
      return "An account already exists for that email.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 6 characters).";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/expired-action-code":
      return "This link has expired. Request a new one.";
    case "auth/invalid-action-code":
      return "This link has already been used or is invalid. Request a new one.";
    default:
      return fallback;
  }
}
