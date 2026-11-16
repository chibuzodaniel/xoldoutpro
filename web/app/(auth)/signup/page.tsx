import type { Metadata } from "next";
import { JoinCard } from "@/components/auth/JoinCard";

// Join XOLDOUT (xoldout-signup.html, explicit ask 2026-11-16): Create account /
// Sign in tabs, Google first, then email. New accounts continue to onboarding.
export const metadata: Metadata = { title: "Join XOLDOUT" };

export default function SignupPage() {
  return <JoinCard initialMode="signup" />;
}
