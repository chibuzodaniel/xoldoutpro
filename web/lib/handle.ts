import { db } from "@/lib/db";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 20) || "fan"
  );
}

/** Derives a unique handle from an email/display name, appending digits on collision. */
export async function generateUniqueHandle(seed: string) {
  const base = slugify(seed);
  let candidate = base;
  let suffix = 0;
  while (await db.user.findUnique({ where: { handle: candidate } })) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}
