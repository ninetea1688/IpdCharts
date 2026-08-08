import { PrismaClient } from "@prisma/client";

// Singleton — one client per process. DATABASE_URL is read at construction time,
// so test preload must set it before this module is first imported.
export const prisma = new PrismaClient();
