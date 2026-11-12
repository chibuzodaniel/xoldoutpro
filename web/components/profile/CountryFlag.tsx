import { flagEmoji } from "@/lib/profile/countryFlag";

// The flag next to a user's name everywhere (explicit ask, 2026-11-12).
// `code` is User.countryCode — set only while they show their location.
export function CountryFlag({ code, className = "text-[0.95em]" }: { code: string | null | undefined; className?: string }) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  return (
    <span className={`shrink-0 leading-none ${className}`} role="img" aria-label={`Country: ${code}`} title={code}>
      {flagEmoji(code)}
    </span>
  );
}
