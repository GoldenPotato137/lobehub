'use client';

import { useCallback, useMemo } from 'react';

import Page from '@/routes/(main)/settings/stats';
import WorkspaceWelcome from '@/routes/(main)/settings/stats/features/overview/WorkspaceWelcome';
import { type UserDisplay } from '@/routes/(main)/settings/stats/types';
import { useWorkspaceStore, workspaceSelectors } from '@/store/workspace';

const WorkspaceStatsSetting = () => {
  const members = useWorkspaceStore(workspaceSelectors.members);

  const memberMap = useMemo(() => {
    const map = new Map<string, UserDisplay>();
    for (const m of members) {
      const profile = (
        m as {
          user?: { avatar?: string | null; email?: string | null; fullName?: string | null } | null;
        }
      ).user;
      map.set(m.userId, {
        avatar: profile?.avatar ?? null,
        name: profile?.fullName || profile?.email || m.userId,
      });
    }
    return map;
  }, [members]);

  const resolveUser = useCallback(
    (userId: string): UserDisplay => memberMap.get(userId) ?? { avatar: null, name: userId },
    [memberMap],
  );

  return <Page enableUserDimension headerNode={<WorkspaceWelcome />} resolveUser={resolveUser} />;
};

WorkspaceStatsSetting.displayName = 'WorkspaceStatsSetting';

export default WorkspaceStatsSetting;
