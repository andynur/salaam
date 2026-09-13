import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { HttpError } from "../../core/errors";
import { recordAudit } from "../../core/audit/repository";
import type { ClubGroupRow, ClubTrack } from "../../shared/club";
import { clubAccess, notFound } from "./access";
import { clubGroupInput, clubGroupMemberInput, clubTrackInput } from "./input";

// Mentoring groups are the club's small-circle structure: one mentor and a handful of
// santri on one topic, optionally inside a learning track. The mentor may be a teacher who
// mentors the club or a senior santri guiding juniors — but mentoring is a label here, not
// a capability: every write below goes through club.manage, so a santri mentor reads only.

function groupNotFound(): never { throw new HttpError(404, "NOT_FOUND", "Kelompok tidak ditemukan di klub ini."); }

export async function clubTracks(db: SQL, actor: Actor, clubId: string): Promise<ClubTrack[]> {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    return tx<ClubTrack[]>`SELECT t.id, t.slug, t.name, t.tagline, t.description, t.position,
        t.archived_at IS NOT NULL AS archived,
        (SELECT count(*)::int FROM club_groups g WHERE g.track_id = t.id AND g.archived_at IS NULL) AS groups,
        (SELECT count(*)::int FROM club_group_members gm JOIN club_groups g ON g.id = gm.group_id
          WHERE g.track_id = t.id AND g.archived_at IS NULL AND gm.removed_at IS NULL) AS members
      FROM club_tracks t WHERE t.club_id = ${clubId} AND t.archived_at IS NULL
      ORDER BY t.position, t.name, t.id LIMIT 20`;
  });
}

// One row per group with its mentor, track, live member count, and the first few member
// names for the avatar stack. `mentorRole` is the mentor's club role, which is what tells
// a teacher mentor apart from a santri mentor in the UI.
export async function clubGroups(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number, trackId: string, level: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId);
    return tx<ClubGroupRow[]>`SELECT g.id, g.name, g.topic, g.level, g.capacity, g.schedule, g.note,
        g.archived_at IS NOT NULL AS archived, g.track_id AS "trackId", t.name AS "trackName",
        g.mentor_id AS "mentorId", u.display_name AS "mentorName",
        (SELECT m.role FROM club_members m WHERE m.club_id = g.club_id AND m.user_id = g.mentor_id AND m.removed_at IS NULL) AS "mentorRole",
        (SELECT count(*)::int FROM club_group_members gm WHERE gm.group_id = g.id AND gm.removed_at IS NULL) AS "memberCount",
        EXISTS (SELECT 1 FROM club_group_members gm WHERE gm.group_id = g.id AND gm.removed_at IS NULL AND gm.user_id = ${actor.id}) AS mine,
        COALESCE((SELECT json_agg(json_build_object('id', people.id, 'name', people.name) ORDER BY people.name) FROM (
          SELECT mu.id, mu.display_name AS name FROM club_group_members gm JOIN users mu ON mu.id = gm.user_id
          WHERE gm.group_id = g.id AND gm.removed_at IS NULL ORDER BY mu.display_name, mu.id LIMIT 8) people), '[]') AS members
      FROM club_groups g LEFT JOIN club_tracks t ON t.id = g.track_id LEFT JOIN users u ON u.id = g.mentor_id
      WHERE g.club_id = ${clubId} AND g.archived_at IS NULL
        AND (g.name ILIKE ${pattern} OR g.topic ILIKE ${pattern} OR u.display_name ILIKE ${pattern})
        AND (${trackId} = '' OR g.track_id::text = ${trackId}) AND (${level} = 0 OR g.level = ${level})
      ORDER BY g.level, g.name, g.id LIMIT 51 OFFSET ${offset}`;
  });
}

// Candidates are santri members of this club who are not in any active group yet, so a
// mentor cannot accidentally place one santri in two circles.
export async function clubGroupCandidates(db: SQL, actor: Actor, clubId: string, pattern: string, offset: number) {
  return db.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async tx => {
    await clubAccess(tx, actor, clubId, "manage");
    return tx<{ userId: string; name: string }[]>`SELECT m.user_id AS "userId", u.display_name AS name
      FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId} AND m.removed_at IS NULL AND m.role = 'member' AND u.is_active AND u.display_name ILIKE ${pattern}
        AND NOT EXISTS (SELECT 1 FROM club_group_members gm WHERE gm.club_id = ${clubId} AND gm.user_id = m.user_id AND gm.removed_at IS NULL)
      ORDER BY u.display_name, u.id LIMIT 51 OFFSET ${offset}`;
  });
}

export async function setClubTrack(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubTrackInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    if (input.trackId) {
      const rows = await tx<{ id: string }[]>`UPDATE club_tracks SET slug = ${input.slug}, name = ${input.name}, tagline = ${input.tagline},
        description = ${input.description}, position = ${input.position},
        archived_at = CASE WHEN ${input.archived} THEN COALESCE(archived_at, clock_timestamp()) END,
        updated_at = clock_timestamp() WHERE id = ${input.trackId} AND club_id = ${clubId} RETURNING id`;
      if (!rows.length) throw new HttpError(404, "NOT_FOUND", "Track tidak ditemukan di klub ini.");
      await recordAudit(tx, actor.id, `club.track.${input.archived ? "archived" : "updated"}`, "club_tracks", input.trackId, requestId);
      return { id: input.trackId, archived: input.archived };
    }
    const rows = await tx<{ id: string }[]>`INSERT INTO club_tracks (club_id, slug, name, tagline, description, position)
      VALUES (${clubId}, ${input.slug}, ${input.name}, ${input.tagline}, ${input.description}, ${input.position}) RETURNING id`;
    await recordAudit(tx, actor.id, "club.track.created", "club_tracks", rows[0]!.id, requestId);
    return { id: rows[0]!.id, archived: false };
  });
}

export async function setClubGroup(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubGroupInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    // The composite foreign key already keeps a track inside its club; checking here turns
    // that into an Indonesian message instead of a constraint error.
    if (input.trackId) {
      const track = await tx`SELECT 1 FROM club_tracks WHERE id = ${input.trackId} AND club_id = ${clubId} AND archived_at IS NULL`;
      if (!track.length) throw new HttpError(400, "INVALID_INPUT", "Track kelompok tidak ditemukan di klub ini.");
    }
    // A mentor is named from the club's own membership: a teacher who mentors the club, or
    // a senior santri. Naming a santri here never grants them management rights.
    if (input.mentorId) {
      const mentor = await tx`SELECT 1 FROM club_members m JOIN users u ON u.id = m.user_id
        WHERE m.club_id = ${clubId} AND m.user_id = ${input.mentorId} AND m.removed_at IS NULL AND u.is_active`;
      if (!mentor.length) throw new HttpError(400, "INVALID_INPUT", "Mentor kelompok harus anggota klub yang aktif.");
    }
    if (input.groupId) {
      if (input.mentorId) {
        const conflict = await tx`SELECT 1 FROM club_group_members WHERE group_id = ${input.groupId} AND user_id = ${input.mentorId} AND removed_at IS NULL`;
        if (conflict.length) throw new HttpError(409, "MENTOR_IS_MEMBER", "Mentor tidak dapat menjadi anggota kelompok yang ia dampingi.");
      }
      const rows = await tx<{ id: string }[]>`UPDATE club_groups SET name = ${input.name}, topic = ${input.topic}, level = ${input.level},
        capacity = ${input.capacity}, schedule = ${input.schedule}, note = ${input.note},
        track_id = ${input.trackId}, mentor_id = ${input.mentorId},
        archived_at = CASE WHEN ${input.archived} THEN COALESCE(archived_at, clock_timestamp()) END,
        updated_at = clock_timestamp() WHERE id = ${input.groupId} AND club_id = ${clubId} RETURNING id`;
      if (!rows.length) groupNotFound();
      await recordAudit(tx, actor.id, `club.group.${input.archived ? "archived" : "updated"}`, "club_groups", input.groupId, requestId);
      return { id: input.groupId, archived: input.archived };
    }
    const rows = await tx<{ id: string }[]>`INSERT INTO club_groups (club_id, track_id, name, topic, level, capacity, schedule, note, mentor_id)
      VALUES (${clubId}, ${input.trackId}, ${input.name}, ${input.topic}, ${input.level}, ${input.capacity}, ${input.schedule}, ${input.note}, ${input.mentorId})
      RETURNING id`;
    await recordAudit(tx, actor.id, "club.group.created", "club_groups", rows[0]!.id, requestId);
    return { id: rows[0]!.id, archived: false };
  });
}

// Adding is idempotent: the same santri twice returns the same membership. Capacity and the
// one-group rule are checked here so they read as Indonesian messages; the partial unique
// index stays as the backstop under concurrency.
export async function setClubGroupMember(db: SQL, actor: Actor, clubId: string, body: Record<string, unknown>, requestId: string) {
  const input = clubGroupMemberInput(body);
  return db.begin(async tx => {
    await clubAccess(tx, actor, clubId, "manage", true);
    const group = (await tx<{ id: string; capacity: number; mentorId: string | null }[]>`SELECT id, capacity, mentor_id AS "mentorId"
      FROM club_groups WHERE id = ${input.groupId} AND club_id = ${clubId} AND archived_at IS NULL FOR UPDATE`)[0];
    if (!group) groupNotFound();
    if (input.removed) {
      const rows = await tx<{ userId: string }[]>`UPDATE club_group_members SET removed_at = COALESCE(removed_at, clock_timestamp())
        WHERE group_id = ${input.groupId} AND user_id = ${input.userId} RETURNING user_id AS "userId"`;
      if (!rows.length) notFound();
      await recordAudit(tx, actor.id, "club.group.member.removed", "club_group_members", input.userId, requestId);
      return { groupId: input.groupId, userId: input.userId, removed: true };
    }
    if (group.mentorId === input.userId) throw new HttpError(409, "MENTOR_IS_MEMBER", "Mentor tidak dapat menjadi anggota kelompok yang ia dampingi.");
    const eligible = await tx`SELECT 1 FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ${clubId} AND m.user_id = ${input.userId} AND m.removed_at IS NULL AND m.role = 'member' AND u.is_active`;
    if (!eligible.length) throw new HttpError(400, "INVALID_INPUT", "Anggota kelompok harus santri yang aktif di klub ini.");
    const existing = (await tx<{ groupId: string }[]>`SELECT group_id AS "groupId" FROM club_group_members
      WHERE club_id = ${clubId} AND user_id = ${input.userId} AND removed_at IS NULL`)[0];
    if (existing && existing.groupId !== input.groupId) {
      throw new HttpError(409, "ALREADY_GROUPED", "Santri ini sudah berada di kelompok lain. Keluarkan dari kelompok itu terlebih dahulu.");
    }
    if (!existing) {
      const [count] = await tx<{ total: number }[]>`SELECT count(*)::int AS total FROM club_group_members
        WHERE group_id = ${input.groupId} AND removed_at IS NULL`;
      if (count!.total >= group.capacity) {
        throw new HttpError(409, "GROUP_FULL", "Kelompok sudah penuh. Tambah kapasitas kelompok atau buat kelompok baru.");
      }
    }
    await tx`INSERT INTO club_group_members (group_id, club_id, user_id) VALUES (${input.groupId}, ${clubId}, ${input.userId})
      ON CONFLICT (group_id, user_id) DO UPDATE SET removed_at = NULL,
        joined_at = CASE WHEN club_group_members.removed_at IS NULL THEN club_group_members.joined_at ELSE clock_timestamp() END`;
    await recordAudit(tx, actor.id, "club.group.member.added", "club_group_members", input.userId, requestId);
    return { groupId: input.groupId, userId: input.userId, removed: false };
  });
}
