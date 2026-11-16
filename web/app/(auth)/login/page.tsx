import type { Metadata } from "next";
import { JoinCard } from "@/components/auth/JoinCard";

// Sign in (xoldout-signup.html design, 2026-11-16). Same card as /signup,
// opened on the Sign in tab. ?next= still brings people back where they were.
export const metadata: Metadata = { title: "Sign in to XOLDOUT" };

export default function LoginPage() {
  return <JoinCard initialMode="signin" />;
}
