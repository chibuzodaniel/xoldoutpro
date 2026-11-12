import { db } from "@/lib/db";
import { readSections } from "@/lib/profile/sections";
import { countryFromLocation } from "@/lib/profile/countryFlag";

// Fills User.countryCode for people who set a location before the flag existed
// (2026-11-12). Runs in the daily cron; a batch at a time, then nothing to do.
export async function backfillCountryCodes(limit = 500) {
  const users = await db.user.findMany({
    where: { profileLocation: { not: null }, countryCode: null },
    select: { id: true, profileLocation: true, profileSections: true },
    take: limit,
  });
  let set = 0;
  for (const u of users) {
    const code = readSections(u.profileSections).location ? (countryFromLocation(u.profileLocation)?.iso ?? null) : null;
    if (!code) continue;
    await db.user.update({ where: { id: u.id }, data: { countryCode: code } });
    set++;
  }
  return { checked: users.length, set };
}
