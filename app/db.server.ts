import { PrismaClient, type Prisma } from "@prisma/client";
const options: Prisma.PrismaClientOptions = process.env.DATABASE_URL ? { datasourceUrl: process.env.DATABASE_URL } : {};

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient(options);
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient(options);

export default prisma;
