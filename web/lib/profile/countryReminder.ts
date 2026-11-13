import { db } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications/create";
import { readSections } from "@/lib/profile/sections";

// "Add your country" reminder (explicit ask, 2026-11-13). One shared run used
// by scripts/remind-add-country.ts and the super-moderator panel.
// Who: active accounts with no country yet (no location, or one that doesn't
// match a country). People who chose to hide their location are left alone.
// Never twice within 30 days (checked against their bell).

export const COUNTRY_REMINDER_TITLE = "Show where you're from 🌍";
const BODY = "Add your location so your country's flag shows next to your name across XOLDOUT.";
const REPEAT_DAYS = 30;
const BATCH = 200;

export async function countryReminderTargets() {
  const since = new Date(Date.now() - REPEAT_DAYS * 864e5);
  const candidates = await db.user.findMany({
    where: {
      countryCode: null,
      deletedAt: null,
      pendingGuestAt: null,
      notifications: { none: { title: COUNTRY_REMINDER_TITLE, createdAt: { gte: since } } },
    },
    select: { id: true, profileLocation: true, profileSections: true },
  });
  // Someone who typed a location but switched it off chose not to show it.
  return candidates.filter((u) => !(u.profileLocation && !readSections(u.profileSections).location)).map((u) => u.id);
}

export async function runCountryReminder({ send }: { send: boolean }) {
  const ids = await countryReminderTargets();
  if (!send) return { wouldNotify: ids.length, sent: 0 };
  let sent = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    await notifyUsers(batch, { kind: "REMINDER", title: COUNTRY_REMINDER_TITLE, body: BODY, url: "/profile/sections", tag: "add-country" });
    sent += batch.length;
  }
  return { wouldNotify: ids.length, sent };
}
