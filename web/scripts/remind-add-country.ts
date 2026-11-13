// "Add your country" reminder (2026-11-13).
//
//   npx tsx scripts/remind-add-country.ts          → just counts who'd get it
//   npx tsx scripts/remind-add-country.ts --send   → sends it (bell + push)
//
// Uses DATABASE_URL and the push keys from .env — point them at the live
// database to reach real users. Nobody is reminded twice within 30 days, and
// people who chose to hide their location are skipped. The same run is in the
// moderation dashboard (super moderators: Platform → Country reminder).
import "dotenv/config";
import { runCountryReminder } from "@/lib/profile/countryReminder";

async function main() {
  const send = process.argv.includes("--send");
  const result = await runCountryReminder({ send });
  if (send) console.log(`Sent the reminder to ${result.sent} people.`);
  else console.log(`${result.wouldNotify} people would get the reminder. Run again with --send to send it.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
