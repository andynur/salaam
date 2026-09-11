import { HttpError } from "../errors";

export interface Actor {
  id: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}
export function requirePermission(actor: Actor | null, permission: string): asserts actor is Actor {
  if (!actor) throw new HttpError(401, "UNAUTHENTICATED", "Silakan masuk untuk melanjutkan.");
  if (!actor.permissions.includes(permission)) throw new HttpError(403, "FORBIDDEN", "Anda tidak memiliki akses ke halaman ini.");
}
