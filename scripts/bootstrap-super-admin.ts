import { config } from "dotenv";

config({ path: ".env.local" });
config();

const { createAccessPersistence, createSuperAdminBootstrap } =
  await import("../src/features/access/server/index.js");
const { createPrismaClient } = await import(
  "../src/platform/database/client.js"
);

const email = required("BOOTSTRAP_EMAIL");
const firebaseUid = required("BOOTSTRAP_FIREBASE_UID");
const fullName = required("BOOTSTRAP_FULL_NAME");
const prisma = createPrismaClient();

try {
  const result = await createSuperAdminBootstrap(
    createAccessPersistence(prisma).superAdminBootstrap,
  )({
    correlationId: crypto.randomUUID(),
    email,
    firebaseUid,
    fullName,
  });

  process.stdout.write(
    `${result.created ? "Created" : "Confirmed"} Super Admin ${email}.\n`,
  );
} finally {
  await prisma.$disconnect();
}

function required(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}
