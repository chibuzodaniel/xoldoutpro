import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Local `prisma dev` explicitly recommends capping the pool at 10 connections
// for its embedded Postgres — exceeding it previously killed the server outright
// rather than queuing. A hosted Postgres in production can raise this.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
