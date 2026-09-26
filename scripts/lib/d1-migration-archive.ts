import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ivLength = 12;
const tagLength = 16;
const migrationMagic = Buffer.from("UNYONPGD1");
const migrationContext = Buffer.from("unyon-postgres-to-d1/v1");
const backupMagic = Buffer.from("UNYOND1B1");
const backupContext = Buffer.from("unyon-d1-backup/v1");

export function encryptMigrationArchive(value: unknown, key: Buffer) {
  return encryptPayload(Buffer.from(JSON.stringify(value), "utf8"), key, migrationMagic, migrationContext);
}

export function decryptMigrationArchive(archive: Buffer, key: Buffer) {
  return JSON.parse(decryptPayload(archive, key, migrationMagic, migrationContext).toString("utf8")) as unknown;
}

export function encryptD1BackupArchive(value: unknown, key: Buffer) {
  return encryptPayload(Buffer.from(JSON.stringify(value), "utf8"), key, backupMagic, backupContext);
}

export function decryptD1BackupArchive(archive: Buffer, key: Buffer) {
  return JSON.parse(decryptPayload(archive, key, backupMagic, backupContext).toString("utf8")) as unknown;
}

function encryptPayload(payload: Buffer, key: Buffer, magic: Buffer, context: Buffer) {
  assertKey(key);
  const iv = randomBytes(ivLength);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(context);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext]);
}

function decryptPayload(archive: Buffer, key: Buffer, magic: Buffer, context: Buffer) {
  assertKey(key);
  const minimumLength = magic.length + ivLength + tagLength + 1;
  if (archive.length < minimumLength || Buffer.compare(archive.subarray(0, magic.length), magic) !== 0) {
    throw new Error("Invalid or mismatched encrypted D1 archive");
  }

  const ivStart = magic.length;
  const tagStart = ivStart + ivLength;
  const payloadStart = tagStart + tagLength;
  const decipher = createDecipheriv("aes-256-gcm", key, archive.subarray(ivStart, tagStart));
  decipher.setAAD(context);
  decipher.setAuthTag(archive.subarray(tagStart, payloadStart));
  return Buffer.concat([decipher.update(archive.subarray(payloadStart)), decipher.final()]);
}

function assertKey(key: Buffer): asserts key is Buffer {
  if (!Buffer.isBuffer(key) || key.length !== 32) {
    throw new Error("D1 migration encryption key must be exactly 32 bytes");
  }
}
