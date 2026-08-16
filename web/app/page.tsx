import { redirect } from "next/navigation";

// Discover is open to everyone (see app/(app)/layout.tsx) — no need to
// branch on auth state here, unlike when anonymous visitors used to be
// bounced to /login.
export default function RootPage() {
  redirect("/discover");
}
