import { config } from "dotenv";
import { execFileSync } from "node:child_process";

config({ path: ".env.local" });
config();

const { createAccessPersistence, createSuperAdminBootstrap } = await import(
  "../src/features/access/server/index.js"
);
const useD1 = process.env.PERSISTENCE_PROVIDER === "d1";
const prismaRuntime = useD1
  ? null
  : await import("../src/platform/database/client.js");

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
if (useD1) applyLocalD1Migrations();
let existingFirebaseUid: string | undefined;
if (useD1) {
  const [result] = runLocalD1Query(
    `SELECT firebase_uid FROM portal_users WHERE email = ${sqlString(email)} LIMIT 1`,
  );
  existingFirebaseUid = result?.results[0]?.firebase_uid as string | undefined;
} else {
  const lookupPrisma = prismaRuntime!.createPrismaClient();
  try {
    existingFirebaseUid = (await lookupPrisma.portalUser.findUnique({ where: { email }, select: { firebaseUid: true } }))?.firebaseUid;
  } finally { await lookupPrisma.$disconnect(); }
}
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

if (useD1) {
  if (fullName.length > 160) throw new Error("LOCAL_SUPER_ADMIN_NAME is too long");
  const created = await bootstrapLocalD1SuperAdmin(email, claims.sub, fullName);
  process.stdout.write(`${created ? "Created" : "Confirmed"} local Super Admin ${email}.\n`);
} else {
  const prisma = prismaRuntime!.createPrismaClient();
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
}

async function bootstrapLocalD1SuperAdmin(
  email: string,
  firebaseUid: string,
  fullName: string,
) {
  const now = new Date().toISOString();
  const [matchingUsers] = runLocalD1Query(
    `SELECT id, firebase_uid, email FROM portal_users
     WHERE firebase_uid = ${sqlString(firebaseUid)} OR email = ${sqlString(email)}`,
  );
  const user = matchingUsers?.results[0] as {
    id: string;
    firebase_uid: string;
    email: string;
  } | undefined;
  if (user && (user.firebase_uid !== firebaseUid || user.email !== email)) {
    throw new Error("Local D1 bootstrap identity conflicts with an existing Portal User");
  }

  const portalUserId = user?.id ?? crypto.randomUUID();
  const [currentAppointments] = runLocalD1Query(
    `SELECT id FROM appointments
     WHERE portal_user_id = ${sqlString(portalUserId)} AND role = 'SUPER_ADMIN'
       AND university_id IS NULL AND starts_at <= ${sqlString(now)}
       AND (ends_at IS NULL OR ends_at > ${sqlString(now)})
     ORDER BY starts_at, id LIMIT 1`,
  );
  const activeAppointment = currentAppointments?.results[0] as { id: string } | undefined;
  if (!activeAppointment) {
    const [scheduledAppointments] = runLocalD1Query(
      `SELECT id FROM appointments WHERE portal_user_id = ${sqlString(portalUserId)}
       AND role = 'SUPER_ADMIN' AND university_id IS NULL
       AND starts_at > ${sqlString(now)} LIMIT 1`,
    );
    if (scheduledAppointments?.results.length) {
      throw new Error("Local D1 bootstrap conflicts with a scheduled Super Admin Appointment");
    }
  }

  const appointmentId = activeAppointment?.id ?? crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  const created = !activeAppointment;
  const userWrite = user
    ? `UPDATE portal_users SET full_name = ${sqlString(fullName)}, status = 'ACTIVE', updated_at = ${sqlString(now)}
       WHERE id = ${sqlString(portalUserId)} AND firebase_uid = ${sqlString(firebaseUid)} AND email = ${sqlString(email)};`
    : `INSERT INTO portal_users (id, firebase_uid, email, full_name, status, created_at, updated_at)
       VALUES (${sqlString(portalUserId)}, ${sqlString(firebaseUid)}, ${sqlString(email)}, ${sqlString(fullName)}, 'ACTIVE', ${sqlString(now)}, ${sqlString(now)});`;
  const appointmentWrite = created
    ? `INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at, created_at)
       VALUES (${sqlString(appointmentId)}, ${sqlString(portalUserId)}, 'SUPER_ADMIN', NULL, ${sqlString(now)}, ${sqlString(now)});`
    : "";
  runLocalD1Query(`${userWrite} ${appointmentWrite}
    INSERT INTO audit_logs (id, actor_portal_user_id, action, resource_type, resource_id, correlation_id, metadata, occurred_at)
    VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(portalUserId)}, '${created ? "super_admin.bootstrapped" : "super_admin.confirmed"}', 'Appointment', ${sqlString(appointmentId)}, ${sqlString(correlationId)}, ${sqlString(JSON.stringify({ created }))}, ${sqlString(now)});`);

  const [verified] = runLocalD1Query(
    `SELECT u.id FROM portal_users AS u JOIN appointments AS a ON a.portal_user_id = u.id
     WHERE u.id = ${sqlString(portalUserId)} AND u.firebase_uid = ${sqlString(firebaseUid)}
       AND u.email = ${sqlString(email)} AND u.status = 'ACTIVE' AND a.role = 'SUPER_ADMIN'
       AND a.university_id IS NULL AND a.starts_at <= ${sqlString(now)}
       AND (a.ends_at IS NULL OR a.ends_at > ${sqlString(now)})`,
  );
  if (!verified?.results.length) throw new Error("Local D1 Super Admin bootstrap did not complete");
  return created;
}

function runLocalD1Query(sql: string) {
  if (process.env.APP_ENV !== "local" || !useD1) {
    throw new Error("D1 bootstrap is restricted to the local D1 runtime");
  }
  const output = execFileSync(
    "./node_modules/.bin/wrangler",
    [
      "d1", "execute", "unyon-mindanao-local-d1", "--local", "--yes",
      "--config", "wrangler.d1.local.jsonc", "--json", "--command", sql,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return JSON.parse(output) as Array<{
    results: Array<Record<string, unknown>>;
    success: boolean;
  }>;
}

function applyLocalD1Migrations() {
  execFileSync(
    "./node_modules/.bin/wrangler",
    [
      "d1", "migrations", "apply", "unyon-mindanao-local-d1", "--local",
      "--config", "wrangler.d1.local.jsonc",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
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
