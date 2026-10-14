import { PrismaClient } from "@prisma/client";

// Reuse one client across hot reloads in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Explicit re-exports: @prisma/client is CommonJS and external to the Next bundle, so a runtime
// `export *` can't be analysed (Turbopack warns on every request). Types are erased at compile time.
export { Prisma } from "@prisma/client";
export type * from "@prisma/client";
