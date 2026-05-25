'use client';

import { Fragment, useEffect } from 'react';

import NavHeader from '@/features/NavHeader';
import SettingContainer from '@/features/Setting/SettingContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { SettingsTabs } from '@/store/global/initialState';
import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useWorkspaceStore, workspaceSelectors } from '@/store/workspace';

import { componentMap } from './componentMap';

const REDIRECT_MAP: Record<string, string> = {
  [SettingsTabs.Common]: SettingsTabs.Appearance,
  [SettingsTabs.ChatAppearance]: SettingsTabs.Appearance,
  [SettingsTabs.Agent]: SettingsTabs.ServiceModel,
  [SettingsTabs.TTS]: SettingsTabs.ServiceModel,
  [SettingsTabs.Image]: SettingsTabs.ServiceModel,
};

/**
 * Legacy workspace-tab URLs (`/settings/workspace-general`,
 * `/settings/workspace-members`) are no longer rendered inside `/settings/*`
 * — workspace settings live under `/:workspaceSlug/settings/*`. Redirect to
 * the active workspace's equivalent page; fall back to the user profile when
 * no workspace is active.
 *
 * Keys are matched as raw URL segments — the enum members that used to
 * declare them (`SettingsTabs.WorkspaceGeneral`, `SettingsTabs.WorkspaceMembers`)
 * were removed along with the workspace-aware personal sidebar.
 */
const LEGACY_WORKSPACE_TARGET: Record<string, 'general' | 'members'> = {
  'workspace-general': 'general',
  'workspace-members': 'members',
};

interface SettingsContentProps {
  activeTab?: string;
  mobile?: boolean;
}

const SettingsContent = ({ mobile, activeTab }: SettingsContentProps) => {
  const enableBusinessFeatures = useServerConfigStore(serverConfigSelectors.enableBusinessFeatures);
  const navigate = useWorkspaceAwareNavigate();
  const activeSlug = useWorkspaceStore((s) => workspaceSelectors.activeWorkspace(s)?.slug ?? null);

  useEffect(() => {
    if (activeTab && REDIRECT_MAP[activeTab]) {
      // Personal-only redirect: legacy URL aliases (common, agent, tts, image,
      // chat-appearance) map to personal-settings tabs. `escape: true` keeps the
      // user in personal context even when a workspace happens to be active.
      navigate(`/settings/${REDIRECT_MAP[activeTab]}`, { escape: true, replace: true });
      return;
    }
    if (activeTab && LEGACY_WORKSPACE_TARGET[activeTab]) {
      const target = LEGACY_WORKSPACE_TARGET[activeTab];
      navigate(activeSlug ? `/${activeSlug}/settings/${target}` : '/settings/profile', {
        replace: true,
      });
    }
  }, [activeTab, activeSlug, navigate]);

  const renderComponent = (tab: string) => {
    const Component = componentMap[tab as keyof typeof componentMap] || componentMap.appearance;
    if (!Component) return null;

    const componentProps: { mobile?: boolean } = {};
    if (
      [
        SettingsTabs.About,
        SettingsTabs.ServiceModel,
        SettingsTabs.Provider,
        SettingsTabs.Profile,
        SettingsTabs.Stats,
        SettingsTabs.Usage,
        SettingsTabs.Security,
        ...(enableBusinessFeatures
          ? [SettingsTabs.Plans, SettingsTabs.Credits, SettingsTabs.Billing, SettingsTabs.Referral]
          : []),
      ].includes(tab as any)
    ) {
      componentProps.mobile = mobile;
    }

    return <Component {...componentProps} />;
  };

  if (activeTab && REDIRECT_MAP[activeTab]) return null;
  if (activeTab && LEGACY_WORKSPACE_TARGET[activeTab]) return null;

  if (mobile) {
    return activeTab ? renderComponent(activeTab) : renderComponent(SettingsTabs.Profile);
  }

  return (
    <>
      {Object.keys(componentMap).map((tabKey) => {
        const isProvider = tabKey === SettingsTabs.Provider;
        if (activeTab !== tabKey) return null;
        const content = renderComponent(tabKey);
        if (isProvider) return <Fragment key={tabKey}>{content}</Fragment>;
        return (
          <Fragment key={tabKey}>
            <NavHeader />
            <SettingContainer maxWidth={1024} paddingBlock={'24px 128px'} paddingInline={24}>
              {content}
            </SettingContainer>
          </Fragment>
        );
      })}
    </>
  );
};

export default SettingsContent;
