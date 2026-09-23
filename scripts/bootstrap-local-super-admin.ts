import { config } from "dotenv";

config({ path: ".env.local" });
config();

const { createAccessPersistence, createSuperAdminBootstrap } =
  await import("../src/features/access/server/index.js");
const { createPrismaClient } = await import(
  "../src/platform/database/client.js"
);

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const projectId = process.env.FIREBASE_PROJECT_ID;
const email = process.env.LOCAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.LOCAL_SUPER_ADMIN_PASSWORD;
const fullName = process.env.LOCAL_SUPER_ADMIN_NAME?.trim();

if (!host || !projectId || !email || !password || !fullName) {
  throw new Error(
    "FIREBASE_AUTH_EMULATOR_HOST, FIREBASE_PROJECT_ID, LOCAL_SUPER_ADMIN_EMAIL, LOCAL_SUPER_ADMIN_PASSWORD, and LOCAL_SUPER_ADMIN_NAME are required",
  );
}

const baseUrl = `http://${host}`;
if (process.env.APP_ENV !== "local" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseUrl).hostname)) {
  throw new Error("Local bootstrap requires a loopback Firebase emulator and APP_ENV=local");
}
const lookupPrisma = createPrismaClient();
let existingFirebaseUid: string | undefined;
try {
  existingFirebaseUid = (await lookupPrisma.portalUser.findUnique({ where: { email }, select: { firebaseUid: true } }))?.firebaseUid;
} finally { await lookupPrisma.$disconnect(); }
let account = await authenticate("accounts:signUp");

if ("error" in account && (account.error.message.includes("EMAIL_EXISTS") || account.error.message.includes("DUPLICATE_LOCAL_ID"))) {
  account = await authenticate("accounts:signInWithPassword");
}

if (!("error" in account) && !account.idToken) {
  account = await authenticate("accounts:signInWithPassword");
}

if ("error" in account) {
  throw new Error(`Firebase emulator rejected local bootstrap: ${account.error.message}`);
}

if (!account.idToken) {
  throw new Error("Firebase emulator did not return an ID token");
}

let claims = decodeClaims(account.idToken);

if (!claims.email_verified) {
  await firebaseRequest("accounts:sendOobCode", {
    idToken: account.idToken,
    requestType: "VERIFY_EMAIL",
  });
  const codesResponse = await fetch(
    `${baseUrl}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  const codes = (await codesResponse.json()) as {
    oobCodes?: Array<{
      email: string;
      oobLink: string;
      requestType: string;
    }>;
  };
  const verification = codes.oobCodes
    ?.toReversed()
    .find(
      (code) =>
        code.email.toLowerCase() === email &&
        code.requestType === "VERIFY_EMAIL",
    );

  if (!verification) {
    throw new Error("Firebase emulator did not create a verification code");
  }

  const verificationResponse = await fetch(verification.oobLink);

  if (!verificationResponse.ok) {
    throw new Error("Firebase emulator email verification failed");
  }

  const signedIn = await authenticate("accounts:signInWithPassword");

  if ("error" in signedIn || !signedIn.idToken) {
    throw new Error("Firebase emulator sign-in failed after email verification");
  }
  claims = decodeClaims(signedIn.idToken);
}

if (!claims.sub || claims.email_verified !== true) {
  throw new Error("Local Firebase identity is not verified");
}

const prisma = createPrismaClient();

try {
  const result = await createSuperAdminBootstrap(
    createAccessPersistence(prisma).superAdminBootstrap,
  )({
    correlationId: crypto.randomUUID(),
    email,
    firebaseUid: claims.sub,
    fullName,
  });

  process.stdout.write(
    `${result.created ? "Created" : "Confirmed"} local Super Admin ${email}.\n`,
  );
} finally {
  await prisma.$disconnect();
}

async function authenticate(endpoint: string) {
  return firebaseRequest(endpoint, {
    email,
    password,
    returnSecureToken: true,
    ...(endpoint === "accounts:signUp" && existingFirebaseUid ? { localId: existingFirebaseUid, emailVerified: true, targetProjectId: projectId } : {}),
  });
}

async function firebaseRequest(endpoint: string, body: Record<string, unknown>) {
  const response = await fetch(
    `${baseUrl}/identitytoolkit.googleapis.com/v1/${endpoint}?key=demo-api-key`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(endpoint === "accounts:signUp" && existingFirebaseUid ? { Authorization: "Bearer owner" } : {}) },
      method: "POST",
    },
  );

  return (await response.json()) as
    | { idToken?: string; localId?: string }
    | { error: { message: string } };
}

function decodeClaims(idToken: string) {
  const payload = idToken.split(".")[1];

  if (!payload) {
    throw new Error("Firebase emulator returned a malformed token");
  }

  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    email_verified?: boolean;
    sub?: string;
  };
}
