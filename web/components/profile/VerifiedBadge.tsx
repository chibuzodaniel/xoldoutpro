// PRD §12: verification badge. Criteria for who gets one is explicitly
// undecided (PRD §18) — this only renders the badge; granting it is a
// moderator-only toggle (POST /api/admin/verify).
export function VerifiedBadge({ className = "h-3.5 w-3.5 text-red-soft shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-label="Verified">
      <path d="M12 2l2.4 2.2 3.2-.5 1 3.1 3 1.3-.7 3.2 2 2.7-2 2.7.7 3.2-3 1.3-1 3.1-3.2-.5L12 22l-2.4-2.2-3.2.5-1-3.1-3-1.3.7-3.2-2-2.7 2-2.7-.7-3.2 3-1.3 1-3.1 3.2.5z" />
      <path
        d="M8.5 12.2l2.4 2.4 4.6-4.8"
        fill="none"
        stroke="var(--color-bg, #0a0a0b)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
