"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { ReportSheet, type ReportTargetType } from "./ReportSheet";

const CONTENT_REASONS = [
  { value: "INAPPROPRIATE_CONTENT" as const, label: "Inappropriate content" },
  { value: "COPYRIGHT_CLAIM" as const, label: "Copyright claim" },
];

// In-context reporting, PRD §14: "available as an action on any release,
// post, ... or profile." Hidden when signed out or when the viewer owns the
// thing being reported (pass ownerId for that check; omit if not applicable,
// e.g. a profile page already hides it for your own profile separately).
export function ReportButton({
  targetType,
  targetId,
  ownerId,
  className = "text-xs text-ink-3",
}: {
  targetType: ReportTargetType;
  targetId: string;
  ownerId?: string;
  className?: string;
}) {
  const { appUser } = useAuth();
  const [open, setOpen] = useState(false);

  if (!appUser) return null;
  if (ownerId && ownerId === appUser.id) return null;
  if (targetType === "PROFILE" && targetId === appUser.id) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Report
      </button>
      <ReportSheet
        open={open}
        onClose={() => setOpen(false)}
        targetType={targetType}
        targetId={targetId}
        reasons={CONTENT_REASONS}
        title="Report"
        detailsPlaceholder="Add any detail that might help (optional)"
      />
    </>
  );
}
