"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

// /u/[handle] is the one shareable page outside app/(app)/layout.tsx's own
// gate (it's a top-level Server Component, not under that route group), so
// it needs this same "for now" rule applied separately: a first-time,
// signed-out visitor gets sent to sign up rather than seeing the profile —
// not a product page, so it doesn't get the ShareButton/D2F "stay public"
// exemption those get. Rendered as a no-UI sibling in the Server Component
// page itself, since a Server Component can't call hooks directly.
export function NewVisitorGate() {
  const router = useRouter();
  const { loading, firebaseUser, isNewVisitor } = useAuth();

  useEffect(() => {
    if (!loading && !firebaseUser && isNewVisitor) {
      router.replace("/signup");
    }
  }, [loading, firebaseUser, isNewVisitor, router]);

  return null;
}
