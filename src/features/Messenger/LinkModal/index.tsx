'use client';

import { Flexbox, Modal } from '@lobehub/ui';
import { memo } from 'react';

import { usePermission } from '@/hooks/usePermission';

import type { MessengerPlatform } from '../constants';
import DiscordLinkBody from './Discord';
import SlackLinkBody from './Slack';
import TelegramLinkBody from './Telegram';

interface LinkModalProps {
  appId?: string;
  botUsername?: string;
  /** Brand-name label (e.g. `"Slack"`) sourced from the registry. */
  name: string;
  onClose: () => void;
  open: boolean;
  platform: MessengerPlatform;
}

const LinkModal = memo<LinkModalProps>(({ appId, botUsername, name, onClose, open, platform }) => {
  const { allowed: canCreate } = usePermission('create_content');
  const { allowed: canEdit } = usePermission('edit_own_content');
  const disabled = !canCreate || !canEdit;

  const renderBody = () => {
    switch (platform) {
      case 'slack': {
        return <SlackLinkBody disabled={disabled} />;
      }
      case 'discord': {
        return <DiscordLinkBody appId={appId} disabled={disabled} name={name} />;
      }
      case 'telegram': {
        return <TelegramLinkBody botUsername={botUsername} disabled={disabled} name={name} />;
      }
    }
  };

  return (
    <Modal footer={null} open={open} title={null} width={480} onCancel={onClose}>
      <Flexbox align="center" gap={20} style={{ paddingBlockEnd: 16, paddingBlockStart: 40 }}>
        {renderBody()}
      </Flexbox>
    </Modal>
  );
});

LinkModal.displayName = 'MessengerLinkModal';

export default LinkModal;
