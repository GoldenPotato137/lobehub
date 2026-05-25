'use client';

import { Button, Icon, Tooltip } from '@lobehub/ui';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import SettingHeader from '@/routes/(main)/settings/features/SettingHeader';

import CreateCredModal from './features/CreateCredModal';
import CredsList from './features/CredsList';

const Page = () => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials, reason } = usePermission('manage_provider_key');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCreateSuccess = () => {
    setCreateModalOpen(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <>
      <SettingHeader
        title={t('tab.creds')}
        extra={
          <Tooltip title={reason}>
            <Button
              disabled={!canManageCredentials}
              icon={<Icon icon={Plus} />}
              size="large"
              onClick={() => {
                if (!canManageCredentials) return;
                setCreateModalOpen(true);
              }}
            >
              {t('creds.create')}
            </Button>
          </Tooltip>
        }
      />
      <CredsList key={refreshKey} />
      <CreateCredModal
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onSuccess={handleCreateSuccess}
      />
    </>
  );
};

Page.displayName = 'CredsSetting';

export default Page;
