// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildD1RestoreStatements,
  buildD1ImportStatements,
  d1DataTables,
  getD1BackupExpectedCounts,
  postgresMigrationTables,
  readPostgresMigrationSnapshot,
  serializeD1ImportStatements,
} from "../../scripts/lib/postgres-to-d1";
import { LocalD1Database } from "../fixtures/local-d1";

describe("PostgreSQL-to-D1 import through the D1 schema", () => {
  it("exports explicit business tables and reports, but does not export, Portal Sessions", async () => {
    const queries: string[] = [];
    const snapshot = await readPostgresMigrationSnapshot(async (sql) => {
      queries.push(sql);
      return { rows: sql.includes("COUNT(*)") ? [{ count: "3" }] : [] };
    });

    expect(Object.keys(snapshot.tables)).toEqual(postgresMigrationTables);
    expect(snapshot.excludedPortalSessions).toBe(3);
    expect(queries.every((sql) => !sql.includes("SELECT *"))).toBe(true);
    expect(queries.at(-1)).toBe("SELECT COUNT(*) AS count FROM portal_sessions");
  });

  it("preserves Portal Sessions in D1 backups while migration snapshots still omit them", () => {
    const snapshot = {
      formatVersion: 1 as const,
      createdAt: "2026-09-25T12:00:00.000Z",
      tables: {
        ...Object.fromEntries(d1DataTables.map((table) => [table, []])),
        evaluation_template_versions: [{
          id: "b0000000-0000-4000-8000-000000000001",
          version: 1,
          questions: [
            { label: "Overall event experience", kind: "RATING" },
            { label: "Organization and delivery", kind: "RATING" },
            { label: "Comments or suggestions", kind: "COMMENT" },
          ],
          created_at: "2026-09-22T00:00:00.000Z",
        }],
        portal_users: [{
          id: "user-one",
          firebase_uid: "firebase-user-one",
          email: "user@example.test",
          full_name: "Test User",
          birth_date: null,
          birth_date_version: 1,
          profile_object_id: null,
          status: "ACTIVE",
          created_at: "2026-09-20T00:00:00.000Z",
          updated_at: "2026-09-20T00:00:00.000Z",
        }],
        portal_sessions: [{
          id: "session-one",
          portal_user_id: "user-one",
          token_hash: "s".repeat(64),
          expires_at: "2026-10-01T00:00:00.000Z",
          revoked_at: null,
          created_at: "2026-09-25T00:00:00.000Z",
        }],
      },
    };

    expect(buildD1RestoreStatements(snapshot).some(({ sql }) => sql.startsWith("INSERT INTO portal_sessions"))).toBe(true);
    expect(getD1BackupExpectedCounts(snapshot).portal_sessions).toBe(1);
  });

  it("preserves profile, appointment, event, evaluation, and audit records", async () => {
    const database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
      "0004_invitations.sql",
      "0005_evaluations_and_reports.sql",
    ]);
    try {
      const statements = buildD1ImportStatements({
        formatVersion: 1,
        createdAt: "2026-09-25T12:00:00.000Z",
        excludedPortalSessions: 2,
        tables: {
          ...Object.fromEntries(postgresMigrationTables.map((table) => [table, []])),
          member_universities: [
            {
              id: "university-one",
              name: "North Mindanao University",
              slug: "north-mindanao-university",
              description: null,
              status: "ACTIVE",
              created_at: "2026-09-20T00:00:00.000Z",
              updated_at: "2026-09-20T00:00:00.000Z",
            },
            {
              id: "university-two",
              name: "Southern Mindanao University",
              slug: "southern-mindanao-university",
              description: "Second Member University",
              status: "ARCHIVED",
              created_at: "2026-09-20T00:00:00.000Z",
              updated_at: "2026-09-23T00:00:00.000Z",
            },
          ],
          portal_users: [{
            id: "portal-user-one",
            firebase_uid: "firebase-user-one",
            email: "admin@example.test",
            full_name: "University Admin",
            birth_date: new Date("1998-03-04T00:00:00.000Z"),
            birth_date_version: 1,
            profile_object_id: "profile-image-one",
            status: "ACTIVE",
            created_at: "2026-09-20T00:00:00.000Z",
            updated_at: "2026-09-20T00:00:00.000Z",
          }],
          appointments: [{
            id: "appointment-one",
            portal_user_id: "portal-user-one",
            role: "UNIVERSITY_ADMIN",
            university_id: "university-one",
            starts_at: "2026-09-20T00:00:00.000Z",
            ends_at: null,
            created_at: "2026-09-20T00:00:00.000Z",
          }],
          invitations: [{
            id: "invitation-one",
            token_hash: "d".repeat(64),
            email: "representative@example.test",
            role: "REPRESENTATIVE",
            status: "ACCEPTED",
            university_id: "university-one",
            invited_by_portal_user_id: "portal-user-one",
            accepted_by_portal_user_id: "portal-user-one",
            expires_at: "2026-10-01T00:00:00.000Z",
            accepted_at: "2026-09-22T00:00:00.000Z",
            revoked_at: null,
            created_at: "2026-09-20T00:00:00.000Z",
            updated_at: "2026-09-22T00:00:00.000Z",
          }],
          audit_logs: [{
            id: "audit-one",
            actor_portal_user_id: "portal-user-one",
            action: "event.published",
            resource_type: "Event",
            resource_id: "event-one",
            correlation_id: "request-one",
            metadata: { source: "postgres" },
            occurred_at: "2026-09-22T00:00:00.000Z",
          }],
          announcements: [{
            id: "announcement-one",
            title: "Officer's regional update; September",
            body: "A published announcement.",
            status: "PUBLISHED",
            version: 2,
            published_at: "2026-09-21T00:00:00.000Z",
            created_at: "2026-09-20T00:00:00.000Z",
            updated_at: "2026-09-21T00:00:00.000Z",
          }],
          shortcuts: [{
            id: "shortcut-one",
            label: "Confederation site",
            url: "https://unyon.example.test",
            icon: null,
            sort_order: 1,
            active: true,
            version: 1,
            created_at: "2026-09-20T00:00:00.000Z",
            updated_at: "2026-09-20T00:00:00.000Z",
          }],
          stored_objects: [
            {
              id: "profile-image-one",
              key: "private/profile-image-one.webp",
              purpose: "PROFILE_IMAGE",
              resource_id: "portal-user-one",
              uploader_id: "portal-user-one",
              mime_type: "image/webp",
              size: 1024,
              sha256: "a".repeat(64),
              status: "AVAILABLE",
              expires_at: "2026-09-21T00:00:00.000Z",
              cleaned_at: null,
              created_at: "2026-09-20T00:00:00.000Z",
              updated_at: "2026-09-20T00:00:00.000Z",
            },
            {
              id: "event-cover-one",
              key: "private/event-cover-one.webp",
              purpose: "EVENT_COVER",
              resource_id: "event-one",
              uploader_id: "portal-user-one",
              mime_type: "image/webp",
              size: 2048,
              sha256: "b".repeat(64),
              status: "AVAILABLE",
              expires_at: "2026-09-21T00:00:00.000Z",
              cleaned_at: null,
              created_at: "2026-09-20T00:00:00.000Z",
              updated_at: "2026-09-20T00:00:00.000Z",
            },
            {
              id: "report-pdf-one",
              key: "private/report-pdf-one.pdf",
              purpose: "FINANCIAL_REPORT",
              resource_id: "report-one",
              uploader_id: "portal-user-one",
              mime_type: "application/pdf",
              size: 4096,
              sha256: "c".repeat(64),
              status: "AVAILABLE",
              expires_at: "2026-09-21T00:00:00.000Z",
              cleaned_at: null,
              created_at: "2026-09-20T00:00:00.000Z",
              updated_at: "2026-09-20T00:00:00.000Z",
            },
          ],
          evaluation_template_versions: [{
            id: "b0000000-0000-4000-8000-000000000001",
            version: 1,
            questions: [
              { label: "Overall event experience", kind: "RATING" },
              { label: "Organization and delivery", kind: "RATING" },
              { label: "Comments or suggestions", kind: "COMMENT" },
            ],
            created_at: "2026-09-22T00:00:00.000Z",
          }],
          events: [{
            id: "event-one",
            title: "Regional Leadership Forum",
            description: "A regional workshop.",
            category: "Forum",
            status: "PUBLISHED",
            starts_at: "2026-10-01T02:00:00.000Z",
            ends_at: "2026-10-01T04:00:00.000Z",
            all_day: false,
            location: "Davao City",
            online_url: null,
            contact_person: null,
            owner_university_id: "university-one",
            created_by_portal_user_id: "portal-user-one",
            published_at: "2026-09-22T00:00:00.000Z",
            cancelled_at: null,
            completed_at: null,
            archived_at: null,
            version: 2,
            cover_object_id: "event-cover-one",
            created_at: "2026-09-21T00:00:00.000Z",
            updated_at: "2026-09-22T00:00:00.000Z",
          }],
          event_co_hosts: [{
            event_id: "event-one",
            university_id: "university-two",
            created_at: "2026-09-22T00:00:00.000Z",
          }],
          event_evaluation_windows: [{
            event_id: "event-one",
            template_id: "b0000000-0000-4000-8000-000000000001",
            opens_at: "2026-10-01T04:00:00.000Z",
            closes_at: "2026-10-08T04:00:00.000Z",
            closed: false,
            version: 1,
          }],
          evaluation_responses: [{
            id: "response-one",
            event_id: "event-one",
            portal_user_id: "portal-user-one",
            version: 1,
            submitted_at: "2026-10-02T00:00:00.000Z",
            updated_at: "2026-10-02T00:00:00.000Z",
          }],
          evaluation_answers: [{
            response_id: "response-one",
            position: 0,
            rating: 5,
            comment: null,
          }],
          financial_reports: [{
            id: "report-one",
            title: "2026 Annual Report",
            reporting_period: "2026",
            description: "Annual financial report.",
            created_at: "2026-09-20T00:00:00.000Z",
          }],
          financial_report_revisions: [{
            id: "revision-one",
            report_id: "report-one",
            revision: 1,
            status: "PUBLISHED",
            object_id: "report-pdf-one",
            published_by_id: "portal-user-one",
            published_at: "2026-09-22T00:00:00.000Z",
            superseded_at: null,
            created_at: "2026-09-21T00:00:00.000Z",
          }],
        },
      });

      database.exec(serializeD1ImportStatements(statements));

      await expect(
        database.prepare(`
          SELECT u.email, u.birth_date, u.profile_object_id, a.role, m.name
          FROM portal_users AS u
          JOIN appointments AS a ON a.portal_user_id = u.id
          JOIN member_universities AS m ON m.id = a.university_id
          WHERE u.id = 'portal-user-one'
        `).first(),
      ).resolves.toEqual({
        email: "admin@example.test",
        birth_date: "1998-03-04",
        profile_object_id: "profile-image-one",
        role: "UNIVERSITY_ADMIN",
        name: "North Mindanao University",
      });
      await expect(
        database.prepare(`
          SELECT e.status, e.all_day, w.template_id, u.questions
          FROM events AS e
          JOIN event_evaluation_windows AS w ON w.event_id = e.id
          JOIN evaluation_template_versions AS u ON u.id = w.template_id
          WHERE e.id = 'event-one'
        `).first<{ status: string; all_day: number; template_id: string; questions: string }>(),
      ).resolves.toMatchObject({
        status: "PUBLISHED",
        all_day: 0,
        template_id: "b0000000-0000-4000-8000-000000000001",
        questions: expect.stringContaining("Overall event experience"),
      });
      await expect(
        database.prepare("SELECT metadata FROM audit_logs WHERE id = 'audit-one'").first<{ metadata: string }>(),
      ).resolves.toEqual({ metadata: '{"source":"postgres"}' });
      await expect(
        database.prepare("SELECT title FROM announcements WHERE id = 'announcement-one'").first(),
      ).resolves.toEqual({ title: "Officer's regional update; September" });
      await expect(
        database.prepare(`
          SELECT s.active, c.university_id, a.rating, r.status, r.object_id
          FROM shortcuts AS s
          JOIN event_co_hosts AS c ON c.event_id = 'event-one'
          JOIN evaluation_answers AS a ON a.response_id = 'response-one'
          JOIN financial_report_revisions AS r ON r.id = 'revision-one'
          WHERE s.id = 'shortcut-one'
        `).first(),
      ).resolves.toEqual({
        active: 1,
        university_id: "university-two",
        rating: 5,
        status: "PUBLISHED",
        object_id: "report-pdf-one",
      });
      await expect(
        database.prepare("SELECT COUNT(*) AS count FROM portal_sessions").first(),
      ).resolves.toEqual({ count: 0 });
    } finally {
      database.close();
    }
  });
});
