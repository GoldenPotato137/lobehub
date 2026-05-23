import { ActionIcon, Block, Center, Flexbox, Text } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Trash2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileIcon from '@/components/FileIcon';
import { type UploadFileItem } from '@/types/files';

const styles = createStaticStyles(({ css }) => ({
  actions: css`
    position: absolute;
    z-index: 10;
    inset-block-start: -4px;
    inset-inline-end: -4px;

    border-radius: 5px;

    background: ${cssVar.colorBgElevated};
    box-shadow:
      0 0 0 0.5px ${cssVar.colorFillSecondary} inset,
      ${cssVar.boxShadowTertiary};
  `,
  container: css`
    user-select: none;

    position: relative;

    width: 180px;
    height: 56px;
    border-radius: 8px;
  `,
}));

interface AttachmentPreviewListProps {
  items: UploadFileItem[];
  onRemove: (id: string) => void;
}

/**
 * Render a row of pending/uploaded attachment thumbnails. Pure props-driven —
 * the host owns the state. Uses the same visual language as the chat input
 * `FileItem` so the experience feels consistent.
 */
const AttachmentPreviewList = memo<AttachmentPreviewListProps>(({ items, onRemove }) => {
  const { t } = useTranslation('common');

  if (items.length === 0) return null;

  return (
    <Flexbox horizontal gap={6} style={{ flexWrap: 'wrap' }}>
      {items.map((item) => {
        const isUploading = item.status === 'uploading' || item.status === 'pending';
        return (
          <Block
            horizontal
            align={'center'}
            className={styles.container}
            key={item.id}
            variant={'outlined'}
          >
            <Center flex={'none'} height={56} padding={4} style={{ width: 56 }}>
              <FileIcon fileName={item.file.name} fileType={item.file.type} size={28} />
            </Center>
            <Flexbox flex={1} gap={2} style={{ paddingBlock: 4, paddingInline: 4 }}>
              <Text ellipsis={{ tooltip: item.file.name }} style={{ fontSize: 12, maxWidth: 96 }}>
                {item.file.name}
              </Text>
              <Text style={{ fontSize: 11, opacity: 0.6 }}>
                {isUploading
                  ? `${item.uploadState?.progress ?? 0}%`
                  : item.status === 'error'
                    ? t('error', { defaultValue: 'Error' })
                    : `${Math.round((item.file.size ?? 0) / 1024)} KB`}
              </Text>
            </Flexbox>
            <Flexbox className={styles.actions}>
              <ActionIcon
                color={'red'}
                icon={Trash2Icon}
                size={'small'}
                title={t('delete')}
                onClick={() => onRemove(item.id)}
              />
            </Flexbox>
          </Block>
        );
      })}
    </Flexbox>
  );
});

export default AttachmentPreviewList;
