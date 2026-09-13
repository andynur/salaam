import type { SQL } from "bun";
import type { Actor } from "../../core/permissions";
import { requirePermission } from "../../core/permissions";
import { recordAudit } from "../../core/audit/repository";
import { HttpError } from "../../core/errors";
import { collectionCreateInput, collectionInput, linkItemInput, linkItemUpdateInput } from "./input";
import type { LinkCollection, LinkCollectionsData, LinkItem } from "../../shared/links";

function forbidden() { throw new HttpError(403, "FORBIDDEN", "Anda tidak memiliki akses ke data ini."); }
async function collectionScope(db: SQL, actor: Actor, id: string, manage = false) {
  const [row] = await db<{ ownerId: string | null }[]>`SELECT owner_id AS "ownerId" FROM link_collections WHERE id = ${id} AND archived_at IS NULL`;
  if (!row) throw new HttpError(404, "NOT_FOUND", "Koleksi tidak ditemukan.");
  const allowed = row.ownerId === null ? actor.permissions.includes("links.manage") : row.ownerId === actor.id;
  if (manage && !allowed) forbidden();
  if (!manage && row.ownerId !== null && row.ownerId !== actor.id) forbidden();
  return row;
}
export async function listLinks(db: SQL, actor: Actor): Promise<LinkCollectionsData> {
  requirePermission(actor, "links.view");
  const canManageSchool = actor.permissions.includes("links.manage");
  const collections = await db<LinkCollection[]>`SELECT id, owner_id AS "ownerId", title, description, version,
    (owner_id IS NULL AND ${canManageSchool}) OR owner_id = ${actor.id} AS "canManage"
    FROM link_collections WHERE archived_at IS NULL AND (owner_id IS NULL OR owner_id = ${actor.id}) ORDER BY owner_id NULLS FIRST, position, title, id`;
  const items = await db<LinkItem[]>`SELECT i.id, i.collection_id AS "collectionId", i.title, i.url, i.description, i.version, i.updated_at::text AS "updatedAt"
    FROM link_items i JOIN link_collections c ON c.id = i.collection_id
    WHERE i.archived_at IS NULL AND c.archived_at IS NULL AND (c.owner_id IS NULL OR c.owner_id = ${actor.id})
    ORDER BY i.collection_id, i.position, i.created_at, i.id`;
  return { collections: collections.map(collection => ({ ...collection, items: items.filter(item => item.collectionId === collection.id) })), canManageSchool };
}
export async function createCollection(db: SQL, actor: Actor, body: Record<string, unknown>, requestId: string) {
  requirePermission(actor, "links.view");
  const input = collectionCreateInput(body);
  if (input.scope === "school") requirePermission(actor, "links.manage");
  return db.begin(async tx => {
    const [row] = await tx<{ id: string }[]>`INSERT INTO link_collections (owner_id, title, description)
      VALUES (${input.scope === "school" ? null : actor.id}, ${input.title}, ${input.description}) RETURNING id`;
    await recordAudit(tx, actor.id, `links.collection.${input.scope}.created`, "link_collections", row!.id, requestId);
    return row!;
  });
}
export async function updateCollection(db: SQL, actor: Actor, id: string, body: Record<string, unknown>, requestId: string) {
  const input = collectionInput(body);
  return db.begin(async tx => {
    const scope = await collectionScope(tx, actor, id, true);
    const [row] = await tx<{ version: number }[]>`SELECT version FROM link_collections WHERE id = ${id} FOR UPDATE`;
    if (!row || row.version !== Number(body.version)) throw new HttpError(409, "CHANGED", "Koleksi sudah berubah. Muat ulang sebelum menyimpan.");
    await tx`UPDATE link_collections SET title = ${input.title}, description = ${input.description}, version = version + 1, updated_at = clock_timestamp() WHERE id = ${id}`;
    await recordAudit(tx, actor.id, "links.collection.updated", "link_collections", id, requestId);
    return { id, version: row.version + 1, ownerId: scope.ownerId };
  });
}
export async function createItem(db: SQL, actor: Actor, body: Record<string, unknown>, requestId: string) {
  const input = linkItemInput(body);
  return db.begin(async tx => {
    await collectionScope(tx, actor, input.collectionId, true);
    const [row] = await tx<{ id: string }[]>`INSERT INTO link_items (collection_id, title, url, description) VALUES (${input.collectionId}, ${input.title}, ${input.url}, ${input.description}) RETURNING id`;
    await recordAudit(tx, actor.id, "links.item.created", "link_items", row!.id, requestId);
    return row!;
  });
}
export async function updateItem(db: SQL, actor: Actor, id: string, body: Record<string, unknown>, requestId: string) {
  const input = linkItemUpdateInput(body);
  return db.begin(async tx => {
    const [current] = await tx<{ collectionId: string; version: number }[]>`SELECT collection_id AS "collectionId", version FROM link_items WHERE id = ${id} AND archived_at IS NULL FOR UPDATE`;
    if (!current) throw new HttpError(404, "NOT_FOUND", "Tautan tidak ditemukan.");
    await collectionScope(tx, actor, current.collectionId, true);
    if (current.version !== input.version || current.collectionId !== input.collectionId) throw new HttpError(409, "CHANGED", "Tautan sudah berubah. Muat ulang sebelum menyimpan.");
    await tx`UPDATE link_items SET title = ${input.title}, url = ${input.url}, description = ${input.description}, version = version + 1, updated_at = clock_timestamp() WHERE id = ${id}`;
    await recordAudit(tx, actor.id, "links.item.updated", "link_items", id, requestId);
    return { id, version: input.version + 1 };
  });
}
export async function archiveItem(db: SQL, actor: Actor, id: string, requestId: string) {
  return db.begin(async tx => {
    const [row] = await tx<{ collectionId: string }[]>`SELECT collection_id AS "collectionId" FROM link_items WHERE id = ${id} AND archived_at IS NULL FOR UPDATE`;
    if (!row) throw new HttpError(404, "NOT_FOUND", "Tautan tidak ditemukan.");
    await collectionScope(tx, actor, row.collectionId, true);
    await tx`UPDATE link_items SET archived_at = clock_timestamp(), version = version + 1 WHERE id = ${id}`;
    await recordAudit(tx, actor.id, "links.item.archived", "link_items", id, requestId);
    return { id };
  });
}
