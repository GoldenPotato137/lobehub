import { and, eq, isNull, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * Workspace-aware ownership predicate for content tables.
 *
 * Compat mode semantics:
 * - `ctx.workspaceId` set → row belongs to that team workspace (shared with all
 *   members; `user_id` only records the creator and isn't part of the filter)
 * - `ctx.workspaceId` absent → personal mode: row belongs to a single user with
 *   `workspace_id IS NULL`
 *
 * Used by content router models (agent / session / message / file / topic …)
 * to replace the previous `userId = ?` only filter.
 *
 * @example Model-side
 * ```ts
 * import { buildWorkspaceWhere } from '../utils/workspace';
 *
 * class AgentModel {
 *   constructor(db, userId, workspaceId) { ... }
 *
 *   findById = (id) =>
 *     this.db.query.agents.findFirst({
 *       where: and(
 *         eq(agents.id, id),
 *         buildWorkspaceWhere(
 *           { userId: this.userId, workspaceId: this.workspaceId },
 *           agents,
 *         ),
 *       ),
 *     });
 * }
 * ```
 */
export function buildWorkspaceWhere(
  ctx: { userId: string; workspaceId?: string },
  cols: { userId: AnyPgColumn; workspaceId: AnyPgColumn },
): SQL {
  return ctx.workspaceId
    ? eq(cols.workspaceId, ctx.workspaceId)
    : (and(eq(cols.userId, ctx.userId), isNull(cols.workspaceId)) as SQL);
}

/**
 * Companion to `buildWorkspaceWhere` for INSERT payloads.
 *
 * Always sets `userId` (the creator) and `workspaceId` (nullable). Personal-mode
 * writes get `workspaceId: null`; team-mode writes get the workspace id.
 *
 * @example
 * ```ts
 * await db.insert(agents).values(
 *   buildWorkspacePayload(
 *     { userId: ctx.userId, workspaceId: ctx.workspaceId },
 *     { title: input.title, description: input.description },
 *   ),
 * );
 * ```
 */
export function buildWorkspacePayload<T extends object>(
  ctx: { userId: string; workspaceId?: string },
  base: T,
): T & { userId: string; workspaceId: string | null } {
  return {
    ...base,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId ?? null,
  };
}

/**
 * User-memory ownership predicate — distinct from `buildWorkspaceWhere` because
 * memory has inclusive read semantics:
 *
 * - Personal mode (`workspaceId` absent): match the user's personal memories
 *   (`user_id = ?` AND `workspace_id IS NULL`).
 * - Workspace mode (`workspaceId` present): match this user's personal memories
 *   AND the workspace's shared memories (`user_id = ?` AND (`workspace_id = ?`
 *   OR `workspace_id IS NULL`)). Writes still go to the active workspace, but
 *   reads merge so personal preferences ("prefers concise replies") remain
 *   available inside team conversations.
 */
export function buildUserMemoryWhere(
  ctx: { userId: string; workspaceId?: string },
  cols: { userId: AnyPgColumn; workspaceId: AnyPgColumn },
): SQL {
  if (!ctx.workspaceId) {
    return and(eq(cols.userId, ctx.userId), isNull(cols.workspaceId)) as SQL;
  }

  // Workspace mode: own personal memories + the current workspace's memories.
  return and(
    eq(cols.userId, ctx.userId),

    or(eq(cols.workspaceId, ctx.workspaceId), isNull(cols.workspaceId)) as SQL,
  ) as SQL;
}
