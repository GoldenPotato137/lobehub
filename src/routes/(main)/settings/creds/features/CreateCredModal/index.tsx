'use client';

import { type CredType } from '@lobechat/types';
import { Modal } from '@lobehub/ui';
import { Steps } from 'antd';
import { createStaticStyles } from 'antd-style';
import { type FC, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';

import CredTypeSelector from './CredTypeSelector';
import FileCredForm from './FileCredForm';
import KVCredForm from './KVCredForm';
import OAuthCredForm from './OAuthCredForm';

const styles = createStaticStyles(({ css }) => ({
  content: css`
    padding-block: 24px;
  `,
  steps: css`
    margin-block-end: 24px;
  `,
}));

interface CreateCredModalProps {
  onCancel: () => void;
  onSuccess: () => void;
  open: boolean;
}

const CreateCredModal: FC<CreateCredModalProps> = ({ open, onCancel, onSuccess }) => {
  const { t } = useTranslation('setting');
  const { allowed: canManageCredentials } = usePermission('manage_provider_key');
  const [step, setStep] = useState(0);
  const [credType, setCredType] = useState<CredType | null>(null);

  const handleTypeSelect = (type: CredType) => {
    if (!canManageCredentials) return;

    setCredType(type);
    setStep(1);
  };

  const handleBack = () => {
    setStep(0);
    setCredType(null);
  };

  const handleClose = () => {
    setStep(0);
    setCredType(null);
    onCancel();
  };

  const handleSuccess = () => {
    setStep(0);
    setCredType(null);
    onSuccess();
  };

  const renderForm = () => {
    switch (credType) {
      case 'kv-env':
      case 'kv-header': {
        return (
          <KVCredForm
            disabled={!canManageCredentials}
            type={credType}
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        );
      }
      case 'oauth': {
        return (
          <OAuthCredForm
            disabled={!canManageCredentials}
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        );
      }
      case 'file': {
        return (
          <FileCredForm
            disabled={!canManageCredentials}
            onBack={handleBack}
            onSuccess={handleSuccess}
          />
        );
      }
      default: {
        return null;
      }
    }
  };

  return (
    <Modal
      footer={null}
      open={open}
      title={t('creds.createModal.title')}
      width={600}
      onCancel={handleClose}
    >
      <div className={styles.content}>
        <Steps
          className={styles.steps}
          current={step}
          size="small"
          items={[
            { title: t('creds.createModal.selectType') },
            { title: t('creds.createModal.fillForm') },
          ]}
        />

        {step === 0 ? (
          <CredTypeSelector disabled={!canManageCredentials} onSelect={handleTypeSelect} />
        ) : (
          renderForm()
        )}
      </div>
    </Modal>
  );
};

export default CreateCredModal;
