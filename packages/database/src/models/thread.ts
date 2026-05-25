import type { CreateThreadParams } from '@lobechat/types';
import { ThreadStatus } from '@lobechat/types';
import { and, desc, eq } from 'drizzle-orm';

import type { ThreadItem } from '../schemas';
import { threads } from '../schemas';
import type { LobeChatDatabase } from '../type';
import { buildWorkspacePayload, buildWorkspaceWhere } from '../utils/workspace';

const queryColumns = {
  agentId: threads.agentId,
  createdAt: threads.createdAt,
  groupId: threads.groupId,
  id: threads.id,
  metadata: threads.metadata,
  parentThreadId: threads.parentThreadId,
  sourceMessageId: threads.sourceMessageId,
  status: threads.status,
  title: threads.title,
  topicId: threads.topicId,
  type: threads.type,
  updatedAt: threads.updatedAt,
};

export class ThreadModel {
  private userId: string;
  private db: LobeChatDatabase;
  private workspaceId?: string;

  constructor(db: LobeChatDatabase, userId: string, workspaceId?: string) {
    this.userId = userId;
    this.db = db;
    this.workspaceId = workspaceId;
  }

  private ownership = () =>
    buildWorkspaceWhere({ userId: this.userId, workspaceId: this.workspaceId }, threads);

  create = async (params: CreateThreadParams) => {
    // @ts-ignore
    const [result] = await this.db
      .insert(threads)
      .values(
        buildWorkspacePayload(
          { userId: this.userId, workspaceId: this.workspaceId },
          { status: ThreadStatus.Active, ...params },
        ),
      )
      .onConflictDoNothing()
      .returning();

    return result;
  };

  delete = async (id: string) => {
    return this.db.delete(threads).where(and(eq(threads.id, id), this.ownership()));
  };

  deleteAll = async () => {
    return this.db.delete(threads).where(this.ownership());
  };

  query = async () => {
    const data = await this.db
      .select(queryColumns)
      .from(threads)
      .where(this.ownership())
      .orderBy(desc(threads.updatedAt));

    return data as ThreadItem[];
  };

  queryByTopicId = async (topicId: string) => {
    const data = await this.db
      .select(queryColumns)
      .from(threads)
      .where(and(eq(threads.topicId, topicId), this.ownership()))
      .orderBy(desc(threads.updatedAt));

    return data as ThreadItem[];
  };

  findById = async (id: string) => {
    return this.db.query.threads.findFirst({
      where: and(eq(threads.id, id), this.ownership()),
    });
  };

  update = async (id: string, value: Partial<ThreadItem>) => {
    return this.db
      .update(threads)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(threads.id, id), this.ownership()));
  };
}
