import "server-only";

import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { FilePurpose } from "../contracts";
import type { PrivateFileRepository, StoredFile } from "./private-files";

interface StoredFileRow {
  id: string;
  key: string;
  purpose: FilePurpose;
  resource_id: string;
  uploader_id: string;
  mime_type: string;
  size: number;
  sha256: string | null;
  status: StoredFile["status"];
  expires_at: string;
}

export class D1PrivateFileRepository implements PrivateFileRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async subject(purpose: FilePurpose, id: string, now: Date) {
    if (purpose === "PROFILE_IMAGE") {
      const user = await this.transaction.first<{
        status: string;
        profile_object_id: string | null;
        appointment_count: number;
      }>(
        `SELECT u.status, u.profile_object_id,
                (SELECT COUNT(*) FROM appointments AS a
                 WHERE a.portal_user_id = u.id AND a.starts_at <= ?
                   AND (a.ends_at IS NULL OR a.ends_at > ?)) AS appointment_count
         FROM portal_users AS u WHERE u.id = ?`,
        now.toISOString(),
        now.toISOString(),
        id,
      );
      return user ? {
        activeProfile: user.status === "ACTIVE" && user.appointment_count > 0,
        objectId: user.profile_object_id,
        ownerUniversityId: null,
        purpose,
        resourceId: id,
        status: user.status,
      } : null;
    }

    if (purpose === "EVENT_COVER") {
      const event = await this.transaction.first<{
        cover_object_id: string | null;
        owner_university_id: string | null;
        status: string;
      }>(
        "SELECT cover_object_id, owner_university_id, status FROM events WHERE id = ?",
        id,
      );
      return event ? {
        activeProfile: false,
        objectId: event.cover_object_id,
        ownerUniversityId: event.owner_university_id,
        purpose,
        resourceId: id,
        status: event.status,
      } : null;
    }

    const revision = await this.transaction.first<{
      object_id: string | null;
      status: string;
    }>(
      "SELECT object_id, status FROM financial_report_revisions WHERE id = ?",
      id,
    );
    return revision ? {
      activeProfile: false,
      objectId: revision.object_id,
      ownerUniversityId: null,
      purpose,
      resourceId: id,
      status: revision.status,
    } : null;
  }

  async get(id: string) {
    const row = await this.transaction.first<StoredFileRow>(
      `SELECT id, key, purpose, resource_id, uploader_id, mime_type,
              size, sha256, status, expires_at
       FROM stored_objects WHERE id = ?`,
      id,
    );
    return row ? toStoredFile(row) : null;
  }

  async reserve(input: StoredFile) {
    this.transaction.enqueue(
      `INSERT INTO stored_objects
        (id, key, purpose, resource_id, uploader_id, mime_type, size, sha256, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.id,
      input.key,
      input.purpose,
      input.resourceId,
      input.uploaderId,
      input.mimeType,
      input.size,
      input.sha256,
      input.status,
      input.expiresAt.toISOString(),
    );
  }

  async pendingCount(uploaderId: string, now: Date) {
    const row = await this.transaction.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM stored_objects
       WHERE uploader_id = ? AND status = 'PENDING' AND expires_at > ?`,
      uploaderId,
      now.toISOString(),
    );
    return row?.count ?? 0;
  }

  async commit(object: StoredFile, sha256: string) {
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE stored_objects SET status = 'AVAILABLE', sha256 = ?, updated_at = ?
       WHERE id = ? AND status = 'PENDING' AND expires_at > ?`,
      sha256,
      now,
      object.id,
      now,
    );
    if (object.purpose === "PROFILE_IMAGE") {
      this.transaction.enqueueCheckedMutation(
        "UPDATE portal_users SET profile_object_id = ?, updated_at = ? WHERE id = ? AND status = 'ACTIVE'",
        object.id,
        now,
        object.resourceId,
      );
    } else if (object.purpose === "EVENT_COVER") {
      this.transaction.enqueueCheckedMutation(
        `UPDATE events SET cover_object_id = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND status <> 'ARCHIVED'`,
        object.id,
        now,
        object.resourceId,
      );
    } else {
      this.transaction.enqueueCheckedMutation(
        `UPDATE financial_report_revisions SET object_id = ?
         WHERE id = ? AND status = 'DRAFT'`,
        object.id,
        object.resourceId,
      );
    }
  }

  async fail(id: string) {
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueueCheckedMutation(
      `UPDATE stored_objects SET status = 'FAILED', updated_at = ?
       WHERE id = ? AND cleaned_at IS NULL
         AND (status = 'FAILED' OR (status = 'PENDING' AND expires_at <= ?))`,
      now,
      id,
      now,
    );
  }

  async expired(now: Date) {
    const rows = await this.transaction.all<StoredFileRow>(
      `SELECT id, key, purpose, resource_id, uploader_id, mime_type,
              size, sha256, status, expires_at
       FROM stored_objects
       WHERE cleaned_at IS NULL
         AND (status = 'FAILED' OR (status = 'PENDING' AND expires_at <= ?))
       ORDER BY expires_at, id LIMIT 100`,
      now.toISOString(),
    );
    return rows.map(toStoredFile);
  }

  async markCleaned(id: string, now: Date) {
    this.transaction.enqueueCheckedMutation(
      `UPDATE stored_objects SET cleaned_at = ?, updated_at = ?
       WHERE id = ? AND status = 'FAILED' AND cleaned_at IS NULL`,
      now.toISOString(),
      now.toISOString(),
      id,
    );
  }
}

function toStoredFile(row: StoredFileRow): StoredFile {
  return {
    expiresAt: new Date(row.expires_at),
    id: row.id,
    key: row.key,
    mimeType: row.mime_type,
    purpose: row.purpose,
    resourceId: row.resource_id,
    sha256: row.sha256,
    size: row.size,
    status: row.status,
    uploaderId: row.uploader_id,
  };
}
