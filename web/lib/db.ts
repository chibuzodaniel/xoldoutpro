import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Local `prisma dev`'s embedded Postgres dies outright (rather than queuing)
// past ~10 total connections. A dev server holding all 10 left no room for
// the Prisma CLI (migrate, db execute) or a test run alongside it — any one
// of those tipped it over and froze the local DB. So locally the app takes
// at most 4, leaving headroom; a hosted Postgres in production keeps 10.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === "production" ? 10 : 4,
});

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
